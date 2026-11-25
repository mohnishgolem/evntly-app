#!/bin/sh
# Connects the Retell agent to THIS Mac for prototype testing, in one step:
#   1. starts a Cloudflare quick tunnel to the local app (http://localhost:3106)
#   2. waits until it's live
#   3. points the Retell agent's tool and webhook URLs at it
# Quick tunnels get a new address each time and stop after a while idle, so
# run this again whenever testing stops reaching the app.
#
#   sh scripts/phone-agent/connect-local.sh        (leave it running; Ctrl-C stops the tunnel)
#
# Needs: the local app running on port 3106 (preview "phone-agent-local"),
# ~/.local/cloudflared/cloudflared, and RETELL_API_KEY / RETELL_LLM_ID /
# RETELL_AGENT_ID in .env.local. Only the local app is exposed, and it talks
# to the local Docker database, never production.
set -eu
cd "$(dirname "$0")/../.."
CF="$HOME/.local/cloudflared/cloudflared"
LOG="${TMPDIR:-/tmp}/evntly-phone-tunnel.log"
get() { grep "^$1=" .env.local | tail -1 | cut -d= -f2- | tr -d "\"' "; }

[ -x "$CF" ] || { echo "cloudflared not found at $CF"; exit 1; }
curl -s -o /dev/null -m 5 http://localhost:3106/ || { echo "Start the local app first (port 3106)."; exit 1; }

pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:3106" 2>/dev/null || true
"$CF" tunnel --no-autoupdate --url http://localhost:3106 >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null' INT TERM

URL=""
i=0
while [ $i -lt 60 ]; do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)
  if [ -n "$URL" ] && grep -q "Registered tunnel connection" "$LOG"; then break; fi
  i=$((i + 1)); sleep 1
done
[ -n "$URL" ] || { echo "Tunnel didn't start; see $LOG"; exit 1; }

RETELL_API_KEY=$(get RETELL_API_KEY) RETELL_LLM_ID=$(get RETELL_LLM_ID) RETELL_AGENT_ID=$(get RETELL_AGENT_ID) \
  RETELL_VOICE_ID=$(get RETELL_VOICE_ID || true) PHONE_AGENT_PUBLIC_URL="$URL" OWNER_TRANSFER_NUMBER=$(get OWNER_TRANSFER_NUMBER || true) \
  npx vite-node --config vitest.config.mts scripts/phone-agent/provision-retell.ts --apply

echo "Tunnel: $URL  (Retell agent updated; leave this running while you test)"
wait $TUNNEL_PID
