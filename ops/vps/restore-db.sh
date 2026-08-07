#!/usr/bin/env bash
# Restore a pg_dump -Fc into the ISP compose DB.
# Usage: bash ops/vps/restore-db.sh /path/to/isp_billing_XXXX.dump
set -euo pipefail
DUMP="${1:?usage: restore-db.sh <dump.fc>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/ops/vps"
if [[ ! -f .env ]]; then
  echo "Missing ops/vps/.env" >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a
source .env
set +a
USER="${POSTGRES_USER:-isp_app}"
DB="${POSTGRES_DB:-isp_billing}"
docker compose up -d db
# wait healthy
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo "Restoring $DUMP into $DB ..."
docker compose exec -T db dropdb -U "$USER" --if-exists "$DB" || true
docker compose exec -T db createdb -U "$USER" "$DB"
cat "$DUMP" | docker compose exec -T db pg_restore -U "$USER" -d "$DB" --no-owner --role="$USER" || true
echo "Restore finished (review warnings above)."
docker compose exec -T db psql -U "$USER" -d "$DB" -c "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';"
