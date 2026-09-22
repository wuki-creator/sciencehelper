#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=production
export PORT="${PORT:-3010}"
exec /usr/bin/node server.js

