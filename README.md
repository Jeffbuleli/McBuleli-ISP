# McBuleli ISP

SaaS multi-tenant pour FAI / Wi-Fi : clients, plans, facturation, vouchers, provision MikroTik (PPPoE / hotspot), FreeRADIUS optionnel.

## Stack

| Couche | Techno |
|--------|--------|
| Frontend | React 18 + Vite (`frontend/`) |
| Backend | Node.js + Express (`backend/`) |
| DB | PostgreSQL 16 (`isp_billing`) |
| Prod | VPS `162.35.181.98` - Docker + Nginx (plus de Render / Vercel) |

Legacy UI sous `archive/legacy-src-ui/` - ignoree.

## Local

1. Postgres : `docker compose up -d` (racine) ou DB locale `isp_billing`
2. `cp backend/.env.example backend/.env` - `DATABASE_URL`, `JWT_SECRET`
3. Backend : `cd backend && npm run dev` (port 4000)
4. Frontend : `cd frontend && npm run dev` (port 5173, proxy `/api`)

Details : [`AGENTS.md`](AGENTS.md)

## Prod VPS

Voir [`ops/vps/SERVER.md`](ops/vps/SERVER.md).

```bash
# Sur 162.35.181.98
bash ops/vps/install.sh
# editer ops/vps/.env
bash ops/vps/deploy.sh
# optionnel restore: bash ops/vps/restore-db.sh backups/isp_billing_XXXX.dump
certbot --nginx -d app.mcbuleli.live
```

## Roles

`system_owner`, `super_admin`, `company_manager`, `isp_admin`, `billing_agent`, `noc_operator`, `field_agent`

## Parcours coeur

Clients -> Offres -> Paiement -> Acces MikroTik
