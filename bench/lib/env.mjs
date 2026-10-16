// What every result file records about the machine and the software, so a number can be traced.

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {BENCH, REPO} from './apps.mjs';

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return null;
  }
};

const version = (pkg) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BENCH, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

export function environment(chromeVersion) {
  const toolchain = process.env['NGP_TOOLCHAIN'] ?? path.join(REPO, 'toolchain/out');
  const versionsEnv = path.join(REPO, 'toolchain/versions.env');
  return {
    date: new Date().toISOString(),
    commit: sh('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']),
    dirty: Boolean(sh('git', ['-C', REPO, 'status', '--porcelain', '--', 'packages', 'bench'])),
    machine: {
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / 2 ** 30),
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      power: sh('pmset', ['-g', 'batt'])?.split('\n')[0] ?? null,
    },
    node: process.version,
    chrome: chromeVersion,
    versions: Object.fromEntries(
      [
        '@angular/core',
        '@angular/compiler-cli',
        '@angular/build',
        '@angular/cli',
        '@analogjs/vite-plugin-angular',
        '@oxc-angular/vite',
        'vite',
        'rolldown',
        'typescript',
        'puppeteer-core',
      ].map((p) => [p, version(p)]),
    ),
    patches: fs.existsSync(path.join(BENCH, 'patches')) ? fs.readdirSync(path.join(BENCH, 'patches')) : [],
    ngp: {
      toolchain,
      versions: fs.existsSync(versionsEnv) ? fs.readFileSync(versionsEnv, 'utf8').trim() : null,
      plugin: sh('git', ['-C', REPO, 'log', '-1', '--format=%h', '--', 'packages/vite-plugin-ngp']),
    },
  };
}

/**
 * Waits until the 1-minute load average is below `max` (other builds on the machine skew every
 * number), up to `patienceMs`. Returns the load average when it went ahead.
 */
export async function waitForQuiet(max, patienceMs = 15 * 60_000) {
  const deadline = Date.now() + patienceMs;
  let warned = false;
  while (max && os.loadavg()[0] >= max && Date.now() < deadline) {
    if (!warned) console.log(`  waiting for load < ${max} (now ${os.loadavg()[0].toFixed(1)})`);
    warned = true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return os.loadavg().map((l) => Math.round(l * 100) / 100);
}
