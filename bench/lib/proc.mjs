// Starting and stopping dev servers and builds, as whole process groups.

import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const ENV = {
  ...process.env,
  NG_CLI_ANALYTICS: 'false',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  BROWSER: 'none',
};

/** Starts a long-running process in its own group, keeping the tail of its output. */
export function start({cmd, args, env = {}}, cwd) {
  const child = spawn(cmd, args, {cwd, env: {...ENV, ...env}, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  const lines = [];
  const stamped = []; // {at, text}, for waitForLine
  const waiters = new Set();
  const keep = (chunk) => {
    const at = Date.now();
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      lines.push(line);
      stamped.push({at, text: line});
      for (const w of waiters) w({at, text: line});
    }
    if (lines.length > 400) lines.splice(0, lines.length - 400);
    if (stamped.length > 5000) stamped.splice(0, stamped.length - 5000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({code, signal})));
  /** Resolves with the epoch time of the first output line matching `re` written at or after `since`. */
  const waitForLine = (re, since, timeoutMs) => {
    const hit = stamped.find((l) => l.at >= since && re.test(l.text));
    if (hit) return Promise.resolve(hit.at);
    return new Promise((resolve, reject) => {
      const w = (l) => {
        if (l.at >= since && re.test(l.text)) {
          waiters.delete(w);
          clearTimeout(timer);
          resolve(l.at);
        }
      };
      const timer = setTimeout(() => {
        waiters.delete(w);
        reject(new Error(`no output matching ${re} in ${timeoutMs} ms`));
      }, timeoutMs);
      waiters.add(w);
    });
  };
  return {child, lines, exited, waitForLine, output: () => lines.join('\n')};
}

/** Stops a process started with start(), and everything it spawned. */
export async function stop(proc) {
  if (proc.child.exitCode !== null || proc.child.signalCode !== null) return;
  try {
    process.kill(-proc.child.pid, 'SIGTERM');
  } catch {}
  const done = await Promise.race([proc.exited.then(() => true), sleep(5000).then(() => false)]);
  if (!done) {
    try {
      process.kill(-proc.child.pid, 'SIGKILL');
    } catch {}
    await proc.exited;
  }
  // Workers can outlive the parent for a moment; give the port and the CPU back.
  await sleep(300);
}

/** Runs a process to completion. Returns wall time in ms, the exit code and output. */
export async function run(command, cwd, onStart = null) {
  const t0 = performance.now();
  const proc = start(command, cwd);
  onStart?.(proc);
  const {code} = await proc.exited;
  return {ms: performance.now() - t0, code, output: proc.output()};
}

/** Polls a URL until it answers 200 with HTML. Resolves with the epoch time it did. */
export async function waitForHttp(url, proc, timeoutMs, rootTag = '<app-root') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) throw new Error(`server exited (${proc.child.exitCode}):\n${proc.output()}`);
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(timeoutMs)});
      const body = await res.text();
      if (res.ok && body.includes(rootTag)) return Date.now();
    } catch {}
    await sleep(20);
  }
  throw new Error(`no answer from ${url} in ${timeoutMs} ms:\n${proc.output()}`);
}
