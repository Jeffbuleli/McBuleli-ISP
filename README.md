# McBuleli

Multi-tenant ISP billing and operations: many ISPs, one platform (DRC-ready workflows, Pawapay, Mobile Money TID, vouchers, MikroTik nodes, optional FreeRADIUS).

## Included

- `backend`: Node.js/Express + PostgreSQL
  - JWT authentication (`/api/auth/login`, `/api/auth/me`)
  - password lifecycle (`/api/auth/change-password`, `/api/auth/accept-invite`)
  - RBAC roles (`super_admin`, `company_manager`, `isp_admin`, `billing_agent`, `noc_operator`, `field_agent`)
  - Multi-tenant ISP management
  - tenant team user management (create/reset/deactivate/invite)
  - per-ISP payment methods (`pawapay`, `cash`, `bank_transfer`, etc)
  - manual Mobile Money TID verification queue (submit -> admin approve/reject)
  - **Public API rate limiting** (in-memory per IP) on signup, Wi‑Fi public routes, and subscriber auth; set **`TRUST_PROXY=true`** behind a reverse proxy for correct client IPs
  - **RADIUS accounting webhook** `POST /api/webhooks/radius-accounting` → `radius_accounting_ingest` (optional `ispId` in JSON); **`GET /api/network/radius-accounting-ingest`** for NOC review
  - notification outbox worker with retries (`internal`, `webhook`, `twilio`, **`smtp`** on the email channel via **nodemailer**)
  - test notification endpoint for provider validation
  - access voucher generation/redeem with plan bandwidth and duration
  - MikroTik node management + subscription provisioning events
  - encrypted storage for network-node credentials
  - optional FreeRADIUS sync events/logging; configurable table names (`FREERADIUS_TABLE_RADCHECK` / `FREERADIUS_TABLE_RADREPLY`) for stock `radcheck`/`radreply` schemas
  - overdue billing job: suspend access for past-due unpaid invoices, mark invoices overdue, scheduled + manual trigger
  - renewal invoices: create next invoice before subscription end, queue **SMS or email** (if `customers.email` is set and an active **email** provider is configured) plus internal fallback, extend period on payment
  - subscription suspend/reactivate with network sync hooks
  - manager-defined accreditation role profiles
  - platform SaaS packages and tenant subscriptions: **Essential ($10/mo), Pro ($15/mo), Business ($20/mo)** with different `feature_flags` (max users, network nodes, analytics, custom domain)
  - **Self-serve tenant signup** (`POST /api/public/signup`) with **1-month trial** (`PLATFORM_TRIAL_DAYS=30`), then **Pawapay deposits** in **USD or CDF** (`POST /api/platform/billing/initiate-deposit`; `PLATFORM_USD_TO_CDF` for CDF amount estimate). **Unified Pawapay callback:** `POST /api/webhooks/pawapay` handles **deposits, payouts (withdrawals), and refunds** (same URL in the Pawapay dashboard for all). Optional secret: header `X-Pawapay-Callback-Secret` = `PAWAPAY_CALLBACK_SECRET` (or legacy `PAWAPAY_PLATFORM_CALLBACK_SECRET`). **`GET /api/webhooks/pawapay`** returns JSON instructions and example bodies for your test dashboard. `POST /api/webhooks/pawapay-platform` is an alias. Expired workspaces get **HTTP 402** until a matching deposit completes.
  - customers (optional **email** for renewal notices), plans, subscriptions, invoices, payments
  - **Network telemetry**: `POST /api/network/nodes/:nodeId/collect-telemetry` pulls active PPPoE / Hotspot session counts from MikroTik, stores snapshots, and merges peaks into `network_usage_daily` for dashboard stats
  - super-admin global dashboard + per-ISP dashboard
  - customer self-service portal: opaque token **or** subscriber JWT (`POST /api/subscriber/auth/login`, `POST /api/subscriber/auth/setup-password`) for `GET /api/portal/session` and `POST /api/portal/tid-submissions`; staff `POST /api/portal/tokens` (set `PLATFORM_PUBLIC_BASE_URL` so generated links open the correct frontend host)
- `frontend`: React dashboard for:
  - login/logout and **`/signup`** company registration (trial + plan pick)
  - invite acceptance
  - forced password update on first login/reset
  - creating ISP tenants (super admin)
  - selecting active ISP workspace
  - managing ISP team users
  - configuring payment methods per ISP
  - assigning platform package subscriptions
  - managing accreditation profiles for field teams
  - customer/plan/subscription/invoice operations
  - `/portal` customer view (invoices, subscriptions, TID submit) via portal link, phone + password, or post–Wi‑Fi setup token
  - **Wi‑Fi guest packages**: admin plans include speed, access type (hotspot/PPPoE), max devices, published flag, availability, per-plan redirect; **`/wifi?ispId=`** public page + **Pawapay** Mobile Money (Orange / Airtel / M‑Pesa) without login; success activates subscription and redirects (plan → ISP branding → Google)

## Run locally

### 1) Start PostgreSQL

```bash
docker compose up -d
```

### 2) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

API base: `http://localhost:4000/api`

Default super admin login:

- email: `admin@isp.local`
- password: `admin123`

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Web app: `http://localhost:5173`

## Deploy to Vercel + Render

The hosted setup is:

- Frontend: Vercel project `mcbuleli-front.vercel.app`
- Public app domain: `https://app.mcbuleli.live`
- Backend: Render web service URL, for example `https://<your-render-service>.onrender.com`

### Frontend environment variables on Vercel

Set these in the Vercel project, then redeploy:

```bash
VITE_API_URL=https://<your-render-service>.onrender.com/api
VITE_PUBLIC_API_ORIGIN=https://<your-render-service>.onrender.com
```

`VITE_API_URL` must include `/api`; `VITE_PUBLIC_API_ORIGIN` is the same Render origin without `/api`.

### Backend environment variables on Render

Use `backend/.env.render.example` as the checklist. At minimum set:

```bash
NODE_ENV=production
TRUST_PROXY=true
DATABASE_URL=<Render PostgreSQL external or internal database URL>
JWT_SECRET=<strong random secret>
NETWORK_NODE_SECRET_KEY=<unique 32+ character random secret>
PLATFORM_PUBLIC_BASE_URL=https://app.mcbuleli.live
PUBLIC_API_BASE_URL=https://<your-render-service>.onrender.com
CORS_ORIGINS=https://app.mcbuleli.live,https://mcbuleli-front.vercel.app
```

Use Render build command `npm install` and start command `npm start` from the `backend` directory.

## White-label subdomains/custom domains

The backend now supports host-based tenant resolution:

- wildcard style subdomains: `admin1.mcbuleli.com`
- optional custom domains: `portal.isp-example.com`

### Required production setup

1. DNS
   - Add wildcard record: `*.mcbuleli.com` -> your frontend/reverse-proxy IP
   - For tenant custom domains, ask tenants to point their domain to your proxy IP
2. Reverse proxy (Nginx/Caddy/Traefik)
   - Route both frontend and backend with original `Host` header preserved
   - Forward `X-Forwarded-Host` to backend
3. Backend app
   - Set tenant subdomain/custom domain in Branding settings
   - Backend resolves tenant from host via `/api/tenant/context`
4. Frontend app
   - Uses `/api/tenant/context` to lock ISP workspace by host
   - For production, prefer `VITE_API_URL=/api` behind same domain proxy

Note: `mcbuleli.com` is only an example domain. Replace with your purchased domain later.

## MikroTik integration quick start

1. In dashboard, open `MikroTik Network Node` and add router host, API credentials, profiles.
2. Mark one node as default.
3. Create or reactivate a subscription; provisioning runs automatically.
4. Use `Sync Activate`/`Sync Suspend` buttons for manual retry.
5. Check `Provisioning Events` for success/failed/skipped logs.

Set `NETWORK_NODE_SECRET_KEY` to a **long random value** (32+ characters in production). With `NODE_ENV=production`, the backend **refuses to start** if the key is missing, too short, or a known placeholder. Store it in a secrets manager or K8s secret, rotate only with a plan to re-encrypt stored node credentials.
To enable FreeRADIUS SQL sync into this app’s PostgreSQL (`radius_radcheck` / `radius_radreply`), set `FREERADIUS_SYNC_ENABLED=true`. Provisioning then writes **Simultaneous-Use** from each subscription’s device cap (plan / voucher / Wi‑Fi checkout) alongside password, **Auth-Type**, and **Mikrotik-Rate-Limit**. Point your FreeRADIUS `sql` module at the same DB so NAS authentication uses these rows.

## Next implementation steps

1. Per-CPE signal / throughput time-series and charts (SNMP / MikroTik interface stats)
2. Optional: encrypt `customers.email` at rest for strict compliance tenants
3. Correlate `radius_accounting_ingest` with subscriptions for live “who is online” dashboards
4. Optional CAPTCHA or fraud signals on Wi‑Fi checkout for high-risk markets

### Recently added

- **Public rate limits** (per IP): signup, Wi‑Fi catalog/purchase/status polling, subscriber login/setup-password (`TRUST_PROXY`, env `PUBLIC_RL_*` overrides).
- **`POST /api/webhooks/radius-accounting`**: stores normalized accounting rows (`RADIUS_ACCOUNTING_WEBHOOK_SECRET` required when `NODE_ENV=production`).
- **Telemetry snapshots** now include short **PPPoE / Hotspot session name samples** from MikroTik.
