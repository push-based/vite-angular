#!/usr/bin/env bash
# Compile ngp's TypeScript backend with tsc, against the npm packages built from the same commit.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
src="$here/.cache/angular/packages/compiler-cli/preprocessor"
out="$here/out/preprocessor"

rm -rf "$out"
"$root/node_modules/.bin/tsc" -p "$here/tsconfig.backend.json"
# The package.json marks the output as ESM.
cp "$src/package.json" "$out/package.json"
echo "backend built in $out"
