#!/usr/bin/env bash
# Fail early, with a fix, if this machine can't build ngp.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
source "$here/versions.env"
problems=()

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64 | Darwin-x86_64 | Linux-x86_64 | Linux-aarch64) ;;
  *) problems+=("unsupported host $(uname -sm): build on macOS or Linux (on Windows, use WSL 2)") ;;
esac

for tool in git curl; do
  command -v "$tool" >/dev/null || problems+=("$tool is missing")
done

# Cargo links native code with the system C toolchain.
if ! command -v cc >/dev/null; then
  if [[ "$(uname -s)" == Darwin ]]; then
    problems+=("no C compiler: run \`xcode-select --install\`")
  else
    problems+=("no C compiler: install build-essential (Debian/Ubuntu) or gcc (Fedora)")
  fi
fi

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( node_major < 26 )); then
  problems+=("Node $(node --version 2>/dev/null || echo 'not found'): this repo needs Node 26, run \`nvm use\` in the repo root")
fi

if [[ ! -x "$root/node_modules/.bin/tsc" ]]; then
  problems+=("dependencies not installed: run \`pnpm install\` in the repo root first")
elif [[ "$(node -p "require('$root/node_modules/@angular/compiler-cli/package.json').version")" != "$ANGULAR_NPM_VERSION" ]]; then
  problems+=("@angular/compiler-cli isn't $ANGULAR_NPM_VERSION: run \`pnpm install\` in the repo root")
fi

if (( ${#problems[@]} > 0 )); then
  echo "Can't build ngp yet:" >&2
  printf '  - %s\n' "${problems[@]}" >&2
  exit 1
fi
echo "prerequisites ok"
