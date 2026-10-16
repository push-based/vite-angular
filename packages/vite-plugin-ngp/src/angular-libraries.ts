import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * The Angular libraries an app depends on, directly or through another Angular library: every
 * package that lists `@angular/core` as a dependency or peer dependency.
 *
 * They ship partially compiled, like Angular's own packages. On the server, and under Vitest,
 * `node_modules` is left to Node, which would load them unlinked, so the plugin bundles these
 * instead. `devDependencies` count only when asked for: tests use them, the app doesn't.
 */
export function findAngularLibraries(root: string, options: {devDependencies?: boolean} = {}): string[] {
  const app = readPackageJson(path.join(root, 'package.json'));
  const direct = {...app?.dependencies, ...(options.devDependencies ? app?.devDependencies : {})};
  const queue: {name: string; from: string}[] = Object.keys(direct).map((name) => ({name, from: root}));
  const seen = new Set<string>();
  const libraries: string[] = [];
  while (queue.length > 0) {
    const {name, from} = queue.shift()!;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const dir = findPackageDir(name, from);
    const pkg = dir && readPackageJson(path.join(dir, 'package.json'));
    if (!pkg || !dependsOnAngular(pkg)) {
      continue;
    }
    libraries.push(name);
    for (const dependency of Object.keys({...pkg.dependencies})) {
      queue.push({name: dependency, from: dir});
    }
  }
  return libraries.sort();
}

/** A `resolve.noExternal` pattern for a package and its subpaths. */
export function packagePattern(name: string): RegExp {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:/|$)`);
}

function dependsOnAngular(pkg: PackageJson): boolean {
  return '@angular/core' in {...pkg.dependencies, ...pkg.peerDependencies};
}

/** Node's lookup: `node_modules/<name>` in `from` and each directory above it. */
function findPackageDir(name: string, from: string): string | null {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    if (path.dirname(dir) === dir) {
      return null;
    }
  }
}

function readPackageJson(file: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}
