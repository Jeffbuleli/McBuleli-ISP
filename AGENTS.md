# AGENTS.md

## Cursor Cloud specific instructions

### Architecture
- **Backend**: Node.js + Express 4 (ES modules, `"type": "module"`) in `backend/`
- **Frontend**: React 18 + Vite 5 (JSX, not TypeScript) in `frontend/`
- **Database**: PostgreSQL 16 (auto-creates all tables on startup via `initDb()` in `db.js`)
- **Package manager**: npm (both `backend/` and `frontend/` have `package-lock.json`)
- Ignore the legacy `src/` directory at the repo root — the active app lives in `backend/` and `frontend/`

### Running locally
1. Start PostgreSQL: `sudo service postgresql start`
2. Create database (if first run): `sudo -u postgres psql -c "CREATE DATABASE isp_billing;"` and set password: `sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"`
3. Copy `backend/.env.example` → `backend/.env` and set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/isp_billing` and `JWT_SECRET=<any-dev-secret>`
4. Backend: `cd backend && npm run dev` (port 4000)
5. Frontend: `cd frontend && npm run dev` (port 5173, proxies `/api` to backend)

### Gotchas
- The backend has no test or lint scripts defined. Only the frontend has `build` and `preview` commands.
- `onOpenSettings` in `App.jsx` must call `navigateMobileScreen("settings")` on mobile (via `isMobileShell` check) in addition to setting `window.location.hash` — otherwise the `DashboardScreenGate` won't show settings on PWA mobile.
- The `DashboardAnnouncementsBell` component exists but has been removed from the top bar per design spec. Company messages now flow through the team chat system.
- All icon/toolbar buttons should use consistent 42px sizing and 12px border-radius in dark mode.
- The frontend uses a single `styles.css` file (~7300 lines) for all styling — no CSS modules or CSS-in-JS.
- The backend auto-initializes all database tables on startup (`initDb()`) — no migrations needed.
