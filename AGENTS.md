# McBuleli ISP - Cursor notes

## Architecture

- **Backend**: Node.js + Express 4 (ESM) in `backend/`
- **Frontend**: React 18 + Vite 5 (JSX) in `frontend/`
- **Database**: PostgreSQL 16 - `initDb()` in `db.js` + versioned SQL in `backend/migrations/`
- **Prod**: VPS `162.35.181.98` (`ops/vps/`) - not Render, not Vercel
- Ignore `archive/legacy-src-ui/`

## Local

1. Postgres with DB `isp_billing`
2. `backend/.env` : `DATABASE_URL`, `JWT_SECRET`
3. `cd backend && npm run dev` (4000)
4. `cd frontend && npm run dev` (5173)

## Gotchas

- `onOpenSettings` must call `navigateMobileScreen("settings")` on mobile
- Frontend styles live in one `styles.css`
- Icons: prefer SVG in `icons.jsx` / lucide - no emoji nav
- FreeRADIUS sync defaults off (`FREERADIUS_SYNC_ENABLED=false`)
