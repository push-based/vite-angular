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
export function start({cmd, args}, cwd) {
  const child = spawn(cmd, args, {cwd, env: ENV, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  const lines = [];
  const keep = (chunk) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) lines.push(line);
    if (lines.length > 400) lines.splice(0, lines.length - 400);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({code, signal})));
  return {child, lines, exited, output: () => lines.join('\n')};
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
export async function run(command, cwd) {
  const t0 = performance.now();
  const proc = start(command, cwd);
  const {code} = await proc.exited;
  return {ms: performance.now() - t0, code, output: proc.output()};
}

/** Polls a URL until it answers 200 with HTML. Resolves with the epoch time it did. */
export async function waitForHttp(url, proc, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) throw new Error(`server exited (${proc.child.exitCode}):\n${proc.output()}`);
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(timeoutMs)});
      const body = await res.text();
      if (res.ok && body.includes('<app-root')) return Date.now();
    } catch {}
    await sleep(20);
  }
  throw new Error(`no answer from ${url} in ${timeoutMs} ms:\n${proc.output()}`);
}
