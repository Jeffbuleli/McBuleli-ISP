#!/usr/bin/env bash
# Backup isp_billing from the local docker compose DB.
# Usage: bash ops/vps/backup-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/ops/vps"
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$ROOT/backups/isp_billing_${STAMP}.dump"
mkdir -p "$ROOT/backups"
USER="${POSTGRES_USER:-isp_app}"
DB="${POSTGRES_DB:-isp_billing}"
# Load .env if present
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
  USER="${POSTGRES_USER:-isp_app}"
  DB="${POSTGRES_DB:-isp_billing}"
fi
docker compose exec -T db pg_dump -U "$USER" -Fc "$DB" > "$OUT"
ls -lh "$OUT"
echo "Wrote $OUT"
