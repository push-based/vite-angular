#!/usr/bin/env bash
# Build ngp from the Angular commit in versions.env into toolchain/out:
# check prerequisites, fetch sources, install a local Rust toolchain, compile the
# TypeScript backend, then build the analyzer engines.
# Usage: build.sh [native|wasm ...]   (default: both engines)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
"$here/check-prereqs.sh"
"$here/fetch-angular.sh"
"$here/setup-rust.sh"
"$here/build-backend.sh"
"$here/build-engines.sh" "$@"
echo "ngp built in $here/out"
