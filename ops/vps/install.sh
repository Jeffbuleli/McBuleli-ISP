#!/usr/bin/env bash
# One-time bootstrap on 162.35.181.98
#   ssh root@162.35.181.98 'bash -s' < ops/vps/install.sh
set -euo pipefail
REPO_URL="${REPO_URL:-https://github.com/Jeffbuleli/McBuleli-ISP.git}"
TARGET="${TARGET:-/opt/mcbuleli-isp}"

if [[ ! -d "$TARGET/.git" ]]; then
  git clone "$REPO_URL" "$TARGET"
fi
cd "$TARGET"
git fetch origin
git checkout main
git pull --ff-only origin main

mkdir -p backups
if [[ ! -f ops/vps/.env ]]; then
  cp ops/vps/.env.example ops/vps/.env
  echo "EDIT $TARGET/ops/vps/.env before deploy (JWT_SECRET, POSTGRES_PASSWORD, ...)"
fi

chmod +x ops/vps/*.sh

# Nginx site (TLS via certbot separately)
if [[ -d /etc/nginx/sites-available ]]; then
  cp ops/vps/nginx-mcbuleli-isp.conf /etc/nginx/sites-available/mcbuleli-isp
  ln -sf /etc/nginx/sites-available/mcbuleli-isp /etc/nginx/sites-enabled/mcbuleli-isp
  nginx -t && systemctl reload nginx || true
fi

echo "Next:"
echo "  1. Edit $TARGET/ops/vps/.env"
echo "  2. Optional: copy dump to $TARGET/backups/ then bash ops/vps/restore-db.sh ..."
echo "  3. bash ops/vps/deploy.sh"
echo "  4. certbot --nginx -d app.mcbuleli.live"
echo "  5. Suspend Render + Vercel after smoke"
