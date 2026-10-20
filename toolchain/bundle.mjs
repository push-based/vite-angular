// Assembles the ngp build that ships inside the vite-plugin-ngp package, in packages/vite-plugin-ngp/ngp:
//   preprocessor/                       ngp's TypeScript backend, from toolchain/out
//   engines/wasm/                       the wasm engine, from toolchain/out
//   engines/native/<platform>/          one native engine per platform in NATIVE_PLATFORMS
//   LICENSE, BUILD.json                 Angular's licence, and what this build was made from
//
// Usage:
//   node toolchain/bundle.mjs --natives <dir>   take each engine from <dir>/ngp-native-<platform>/,
//                                               as the Publish workflow downloads them
//   node toolchain/bundle.mjs --host-only       only this machine's engine, from toolchain/out; for
//                                               trying the bundled build locally, never for a release
//   node toolchain/bundle.mjs --check           fail unless the bundle is complete (the package's prepack)
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

const here = import.meta.dirname;
const out = path.join(here, 'out');
const dest = path.resolve(here, '../packages/vite-plugin-ngp/ngp');
// Must match NATIVE_PLATFORMS in packages/vite-plugin-ngp/src/ngp-api.ts.
const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'];

const {values: args} = parseArgs({
  options: {natives: {type: 'string'}, 'host-only': {type: 'boolean'}, check: {type: 'boolean'}},
});

if (args.check) {
  const problems = check();
  if (problems.length > 0) {
    fail(
      `packages/vite-plugin-ngp/ngp is incomplete, so the package would ship without ngp:\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        `\nThe Publish workflow builds every platform and runs toolchain/bundle.mjs before publishing.`,
    );
  }
  console.log(`ngp bundle complete: ${PLATFORMS.join(', ')}`);
  process.exit(0);
}

if (!args.natives === !args['host-only']) fail('pass either --natives <dir> or --host-only');

for (const file of ['preprocessor/api.js', 'engines/wasm/ng_analyze.js', 'engines/wasm/ng_analyze_bg.wasm']) {
  if (!existsSync(path.join(out, file))) fail(`toolchain/out/${file} is missing: run \`pnpm toolchain\` first`);
}
const license = path.join(here, '.cache/angular/LICENSE');
if (!existsSync(license)) fail('toolchain/.cache/angular/LICENSE is missing: run `bash toolchain/fetch-angular.sh`');

rmSync(dest, {recursive: true, force: true});
mkdirSync(dest, {recursive: true});

// Source maps point at TypeScript sources the package doesn't carry, so they stay behind.
cpSync(path.join(out, 'preprocessor'), path.join(dest, 'preprocessor'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map'),
});
// Angular's package.json names the folder @angular/compiler-cli/preprocessor. Only `type` matters here.
writeFileSync(path.join(dest, 'preprocessor/package.json'), JSON.stringify({type: 'module'}, null, 2) + '\n');

cpSync(path.join(out, 'engines/wasm'), path.join(dest, 'engines/wasm'), {recursive: true});

const host = `${process.platform}-${process.arch}`;
const platforms = args['host-only'] ? [host] : PLATFORMS;
for (const platform of platforms) {
  const src = args['host-only']
    ? path.join(out, 'engines/native/ng_analyze.node')
    : path.join(args.natives, `ngp-native-${platform}`, 'ng_analyze.node');
  if (!existsSync(src)) fail(`no native engine for ${platform} at ${src}`);
  const found = binaryPlatform(src);
  if (found !== platform) fail(`${src} is a ${found ?? 'unrecognized'} binary, expected ${platform}`);
  mkdirSync(path.join(dest, 'engines/native', platform), {recursive: true});
  cpSync(src, path.join(dest, 'engines/native', platform, 'ng_analyze.node'));
}
// The addon is loaded with require(), and the package itself is ESM.
writeFileSync(path.join(dest, 'engines/native/package.json'), '{"type": "commonjs"}\n');

const versions = Object.fromEntries(
  readFileSync(path.join(here, 'versions.env'), 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => line.split('=')),
);
writeFileSync(path.join(dest, 'LICENSE'), readFileSync(license));
writeFileSync(
  path.join(dest, 'BUILD.json'),
  JSON.stringify(
    {
      note: "An unofficial build of ngp, Angular's hybrid preprocessor, from angular/angular. Not published or supported by the Angular team.",
      angularCommit: versions.ANGULAR_SHA,
      angularVersion: versions.ANGULAR_NPM_VERSION,
      rust: versions.RUST_TOOLCHAIN,
      platforms,
    },
    null,
    2,
  ) + '\n',
);

const problems = args['host-only'] ? [] : check();
if (problems.length > 0) fail(problems.join('\n'));
console.log(`ngp bundled into packages/vite-plugin-ngp/ngp for ${platforms.join(', ')}`);

/** Everything a release needs in the bundle, as a list of what's missing or wrong. */
function check() {
  const problems = [];
  for (const file of ['preprocessor/api.js', 'engines/wasm/ng_analyze.js', 'engines/wasm/ng_analyze_bg.wasm', 'LICENSE']) {
    if (!existsSync(path.join(dest, file))) problems.push(`${file} is missing`);
  }
  for (const platform of PLATFORMS) {
    const file = path.join(dest, 'engines/native', platform, 'ng_analyze.node');
    if (!existsSync(file)) problems.push(`engines/native/${platform}/ng_analyze.node is missing`);
    else if (binaryPlatform(file) !== platform) problems.push(`engines/native/${platform}/ng_analyze.node isn't a ${platform} binary`);
  }
  return problems;
}

/** Reads a binary's header: Mach-O or ELF, and its CPU. */
function binaryPlatform(file) {
  const b = readFileSync(file).subarray(0, 20);
  if (b.readUInt32LE(0) === 0xfeedfacf) {
    const cpu = b.readUInt32LE(4);
    return cpu === 0x0100000c ? 'darwin-arm64' : cpu === 0x01000007 ? 'darwin-x64' : undefined;
  }
  if (b.readUInt32BE(0) === 0x7f454c46) {
    const machine = b.readUInt16LE(18);
    return machine === 0x3e ? 'linux-x64' : machine === 0xb7 ? 'linux-arm64' : undefined;
  }
  return undefined;
}

function fail(message) {
  console.error(`bundle.mjs: ${message}`);
  process.exit(1);
}
