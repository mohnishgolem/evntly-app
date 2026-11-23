#!/usr/bin/env bash
# Installs playwright-core into this scripts folder only (not the app's package.json).
# Uses the locally installed Google Chrome, so no browser download is needed.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$DIR/node_modules/playwright-core" ]; then
  echo "playwright-core already installed in $DIR"
else
  npm install --prefix "$DIR" --no-audit --no-fund --loglevel=error
fi
node "$DIR/doctor.mjs"
