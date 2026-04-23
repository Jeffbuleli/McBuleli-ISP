# Multi-ISP Billing System (DRC)

Centipid-style foundation for managing many small ISPs in one platform.

## Included

- `backend`: Node.js/Express + PostgreSQL
  - JWT authentication (`/api/auth/login`, `/api/auth/me`)
  - password lifecycle (`/api/auth/change-password`, `/api/auth/accept-invite`)
  - RBAC roles (`super_admin`, `company_manager`, `isp_admin`, `billing_agent`, `noc_operator`, `field_agent`)
  - Multi-tenant ISP management
  - tenant team user management (create/reset/deactivate/invite)
  - per-ISP payment methods (`pawapay`, `cash`, `bank_transfer`, etc)
  - manual Mobile Money TID verification queue (submit -> admin approve/reject)
  - notification outbox worker with retries (`internal`, `webhook`, `twilio`)
  - test notification endpoint for provider validation
  - access voucher generation/redeem with plan bandwidth and duration
  - MikroTik node management + subscription provisioning events
  - encrypted storage for network-node credentials
  - optional FreeRADIUS sync events/logging
  - subscription suspend/reactivate with network sync hooks
  - manager-defined accreditation role profiles
  - platform SaaS packages and tenant subscriptions
  - customers, plans, subscriptions, invoices, payments
  - super-admin global dashboard + per-ISP dashboard
- `frontend`: React dashboard for:
  - login/logout
  - invite acceptance
  - forced password update on first login/reset
  - creating ISP tenants (super admin)
  - selecting active ISP workspace
  - managing ISP team users
  - configuring payment methods per ISP
  - assigning platform package subscriptions
  - managing accreditation profiles for field teams
  - customer/plan/subscription/invoice operations

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

To harden credentials, set `NETWORK_NODE_SECRET_KEY` in backend `.env`.
To enable simulated FreeRADIUS sync tables/events, set `FREERADIUS_SYNC_ENABLED=true`.

## Next implementation steps

1. Add encrypted storage for network node passwords (KMS or app-level encryption key)
2. Add FreeRADIUS table synchronization alongside RouterOS REST calls
3. Add recurring billing scheduler + automatic suspension job
4. Add deep network telemetry pull (active sessions, signal/rx-tx per CPE)
