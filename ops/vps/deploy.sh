#!/usr/bin/env bash
# Deploy McBuleli ISP on VPS (git pull + docker compose).
# Run on host as root from /opt/mcbuleli-isp:
#   bash ops/vps/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f ops/vps/.env ]]; then
  echo "Missing ops/vps/.env - copy from ops/vps/.env.example" >&2
  exit 1
fi

echo "==> git fetch/pull"
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> build frontend (host, for Nginx root)"
(cd frontend && npm ci && npm run build)

echo "==> docker compose up"
(cd ops/vps && docker compose up -d --build)

echo "==> health"
sleep 3
curl -fsS "http://127.0.0.1:4000/health" || curl -fsS "http://127.0.0.1:4000/api/public/platform-packages" || true
echo
echo "Deploy done. Nginx should serve $ROOT/frontend/dist and proxy /api -> :4000"
