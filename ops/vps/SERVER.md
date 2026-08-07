# McBuleli ISP - serveur prod

## Choix d'hote (Phase 0 - 2026-08-07)

| Hote | RAM | Dispo | Verdict |
|------|-----|-------|---------|
| `153.75.235.176` (Cyber Alert + africa-insight) | 1.6 Gio total, ~752 Mio free, swap actif | Insuffisant | **Refuse** |
| `162.35.181.98` (mcbuleli.org) | 7.3 Gio total, ~3.8 Gio free | OK | **Hote choisi** |

Regle: si `153.75` ne peut pas accueillir API + front + DB sans OOM, tout va sur `162.35`.

## Layout cible

```text
/opt/mcbuleli-isp/
  backend/          # Express
  frontend/dist/    # Vite build (servi par Nginx)
  ops/vps/          # compose, nginx, scripts
  backups/          # pg_dump isp_billing
```

Ports localhost:

| Service | Port |
|---------|------|
| API Express | `127.0.0.1:4000` |
| Postgres ISP | `127.0.0.1:5434` (conteneur dedie, isole de mcbuleli fintech `:5432`) |

Postgres **jamais** expose publiquement.

## Domaine

- App: `https://mcbuleli.live` (ou sous-domaine equivalent)
- Origin DNS A/CNAME -> `162.35.181.98` (Cloudflare)

## Cutover Render / Vercel

Apres smoke OK sur VPS:

1. Pointer DNS `mcbuleli.live` vers `162.35.181.98`
2. `certbot --nginx -d mcbuleli.live`
3. Suspendre service Render `mcbuleli-isp` + Postgres Render
4. Desactiver projet Vercel front

## Donnees

DB fraiche initialisee par `initDb()` + migrations (52 tables).

Pour importer un dump Render / local:

```bash
# Sur le VPS
bash ops/vps/restore-db.sh /opt/mcbuleli-isp/backups/isp_billing_XXXX.dump
bash ops/vps/deploy.sh
```

Backup quotidien: cron `15 3 * * *` -> `ops/vps/cron-backup.sh`
