// Memory of a process and everything it spawned, sampled while it runs.
//
// A dev server or build isn't one process: the Angular CLI runs esbuild as a child process and
// type-checks in worker threads, vite-plugin-ngp runs tsgo in a child process, and Vite's Sass
// runs the Dart VM when sass-embedded is installed. So this reads `ps` for the whole process tree
// under one pid, every `intervalMs`, and keeps the peak of the summed resident set sizes and the
// last sample. RSS counts pages shared between processes once per process, so a tree's sum is an
// upper bound on what it really holds. It's the number `top` would add up, and the one a laptop
// runs out of.

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const ps = promisify(execFile);

/** RSS in bytes of `rootPid` and its descendants, plus how many processes that is. */
export async function treeMemory(rootPid) {
  const {stdout} = await ps('ps', ['-axo', 'pid=,ppid=,rss='], {maxBuffer: 16 * 1024 * 1024});
  const children = new Map();
  const rss = new Map();
  for (const line of stdout.split('\n')) {
    const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
    if (!pid) continue;
    rss.set(pid, kb * 1024);
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  let total = 0;
  let count = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    if (!rss.has(pid)) continue;
    total += rss.get(pid);
    count++;
    stack.push(...(children.get(pid) ?? []));
  }
  return {rss: total, processes: count};
}

/**
 * Samples the tree under `rootPid` until stopped. `stop()` returns the peak sum seen, the last
 * sample, and how many samples there were.
 */
export function sampleMemory(rootPid, intervalMs = 100) {
  let peak = {rss: 0, processes: 0};
  let last = {rss: 0, processes: 0};
  let samples = 0;
  let running = true;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || !running) return;
    busy = true;
    try {
      const m = await treeMemory(rootPid);
      if (!running) return;
      samples++;
      last = m;
      if (m.rss > peak.rss) peak = m;
    } catch {
    } finally {
      busy = false;
    }
  }, intervalMs);
  timer.unref();
  return {
    /** The most recent sample. */
    current: () => last,
    /** Take one sample now, outside the interval. */
    sample: async () => {
      const m = await treeMemory(rootPid);
      samples++;
      last = m;
      if (m.rss > peak.rss) peak = m;
      return m;
    },
    stop: () => {
      running = false;
      clearInterval(timer);
      return {peak, last, samples};
    },
  };
}
