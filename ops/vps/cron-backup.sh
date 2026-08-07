#!/usr/bin/env bash
# Cron-friendly daily backup on VPS.
# Install: 15 3 * * * root /opt/mcbuleli-isp/ops/vps/backup-db.sh >> /var/log/mcbuleli-isp-backup.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/ops/vps/backup-db.sh"
# Keep last 14 dumps
find "$ROOT/backups" -name 'isp_billing_*.dump' -mtime +14 -delete 2>/dev/null || true
