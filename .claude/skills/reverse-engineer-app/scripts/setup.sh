#!/usr/bin/env bash
# Installs the skill's one dependency (playwright-core, pinned in package.json
# and package-lock.json) into this scripts folder only. The Evntly app's own
# package.json is never touched. Uses the installed Google Chrome, so no
# browser is downloaded. Reproducible: `npm ci` installs exactly the lockfile.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✖ Node.js 20 or newer is required (playwright-core 1.65.1). Found: $(node -v 2>/dev/null || echo none)" >&2
  exit 1
fi

WANT="$(node -p 'require(process.argv[1]).dependencies["playwright-core"]' "$DIR/package.json")"
HAVE="$(node -p 'try { require(process.argv[1]).version } catch { "" }' "$DIR/node_modules/playwright-core/package.json")"
if [ "$HAVE" = "$WANT" ]; then
  echo "playwright-core $HAVE already installed in $DIR"
else
  # Exactly what package-lock.json says (version and integrity hash).
  npm ci --prefix "$DIR" --no-audit --no-fund --loglevel=error
fi
node "$DIR/doctor.mjs"
