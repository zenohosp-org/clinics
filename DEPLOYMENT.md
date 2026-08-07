# Clinics — deployment

**Status: live.** https://clinics.zenohosp.com · https://api-clinics.zenohosp.com

This is both a record of the deployment and the runbook for repeating or
rolling it back. Everything below is already done unless marked otherwise.

---

## What runs where

| | |
|---|---|
| VPS | `200.97.163.220`, `/opt/zenohosp` |
| Backend container | `zenohosp-clinics-backend-1`, published `127.0.0.1:8110` |
| Frontend | static build in `/var/www/clinics` |
| Config | `/opt/zenohosp/env/clinics.env` (mode 600) |
| nginx | `/etc/nginx/sites-available/{clinics,api-clinics}` |
| TLS | Let's Encrypt, auto-renewing, expires 2026-11-05 |

### The port convention (easy to get wrong)

Every zenohosp backend listens on **8080 inside its container** and publishes to
a unique `127.0.0.1:81xx` host port. The `x-backend-defaults` anchor at the top
of `/opt/zenohosp/docker-compose.yml` sets `PORT: 8080`, and compose
`environment:` beats `env_file:`, so a `PORT=` line in an env file is inert.

**`EXPOSE 9003` in the clinics Dockerfile is cosmetic.** The real address is
`127.0.0.1:8110`.

Host ports in use: 8101 pharmacy · 8102 asset · 8103 finance · 8104 inventory ·
8105 directory · 8106 ot · 8107 labs · 8108 people · 8109 hms · **8110 clinics**

Local dev is different again: backend `9003`, Vite `5177`.

---

## The shared database

Clinics uses **HMS's Supabase database and tables**. Two guards keep it from
damaging that schema, and both matter:

1. **`spring.jpa.hibernate.ddl-auto=none`** — Hibernate never emits DDL.
2. **`clinics.data-seeder.enabled=false`** — the inherited `DataSeeder` is a
   `CommandLineRunner` that issues raw DDL outside Hibernate (drops NOT NULL,
   renames `hospital_services.specialization_id → department_id`, drops and
   re-adds foreign keys, creates tables). `ddl-auto=none` does **not** stop it.
   On the very first clinics boot it ran against HMS's live schema before this
   gate existed; the rename failed on a FK violation so nothing changed.

Disabling the seeder loses nothing — HMS has already applied all of it to the
shared database, and clinics reads the same rows.

**Consequence:** a schema change for a clinics feature must land in HMS first.

---

## SSO: clinics as a Directory module

Registering the OAuth2 client is **not sufficient**. Directory gates SSO on a
database-backed module system, so onboarding an app touches 8 files. All of
this shipped in `zenohosp-org/directory-backend@6674653`:

| File | Purpose |
|---|---|
| `OAuth2AuthorizationService` | `clinics-client` id / secret / redirect-uri |
| `OAuth2Controller` | `registerGate(clinicsClientId, "clinics", "Clinics")` — **the SSO login gate** |
| `AuthService` | includes `clinics` in the JWT `modules` claim |
| `entity/User` | `can_access_clinics` column, defaults `true` |
| `UserDTO`, `UpdateUserModulesRequest` | admin UI toggle |
| `UserService` | reset block, module→flag switch, update handler |
| `DataSeeder` | seeds the `Clinics` module row, backfills the flag |

Directory runs `ddl-auto=update`, so it created `users.can_access_clinics`
itself on boot and backfilled it (`20 pre-existing users`).

**Clinics defaults to ON** for every hospital and user, matching how Labs was
onboarded. To make it opt-in instead, change the `User` default to `false` and
drop the backfill in `DataSeeder.backfillUserModuleAccessFlags()`.

### The flow

1. `clinics.zenohosp.com/oauth2/authorization/directory` (nginx → backend)
2. → `api-directory.zenohosp.com/oauth2/authorize?client_id=clinics-client`
3. → Directory login → consent
4. → `https://api-clinics.zenohosp.com/login/oauth2/code/directory`
5. Backend exchanges the code, sets HttpOnly `sso_token` on `.zenohosp.com`
6. → `https://clinics.zenohosp.com/sso/callback` → `/dashboard`

`OAUTH_REDIRECT_URI` in `clinics.env` and `OAUTH_CLINICS_REDIRECT_URI` in
`directory.env` must match **byte for byte**, or step 4 fails `invalid_grant`.

---

## Deploys

Both repos deploy on push to `main` via GitHub Actions → SSH → VPS.

- `KarthiZenoHosp/clinics` — `clinics-backend/**` rebuilds the container;
  `clinics-frontend/**` rebuilds into `/var/www/clinics`.
- `zenohosp-org/directory-backend` — any push pulls and rebuilds directory.

Requires repo secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

> **Still to do:** add those three secrets to `KarthiZenoHosp/clinics`
> (Settings → Secrets and variables → Actions). Until then, clinics deploys
> must be run by hand on the VPS.

The clinics backend workflow deliberately omits HMS's pre-deploy `pg_dump`
gate: with `ddl-auto=none` and the seeder disabled, a clinics deploy cannot
alter the schema. **Restore that gate if either guard is ever removed.**

### Manual deploy

```bash
cd /opt/zenohosp/clinics && git pull origin main

# backend
cd /opt/zenohosp && docker compose up -d --build clinics-backend

# frontend
cd /opt/zenohosp/clinics/clinics-frontend
npm ci && npm run build
rm -rf /var/www/clinics/* && cp -r dist/* /var/www/clinics/
```

---

## Verify

```bash
curl -s https://api-clinics.zenohosp.com/actuator/health     # {"status":"UP"}
curl -so /dev/null -w '%{http_code}\n' https://clinics.zenohosp.com/patients/1  # 200 (SPA fallback)
curl -sD- -o /dev/null https://clinics.zenohosp.com/oauth2/authorization/directory | grep -i location
# → must contain client_id=clinics-client and the api-clinics redirect_uri
```

Cross-app logout: sign out of clinics, reload an HMS tab — it drops to login
within ~30s. Both poll `/auth/me` and force-logout on the first 401.

### Failure modes

| Symptom | Cause |
|---|---|
| `invalid_grant` at callback | redirect URIs differ between `clinics.env` and `directory.env` |
| Login loops back to `/login` | `JWT_SECRET` differs from Directory's |
| `redirect_uri` is `http://` | `X-Forwarded-Proto` missing from the nginx vhost |
| Clinics missing from a user's modules | `can_access_clinics` NULL/false, or hospital activation row absent |
| 404 on `/patients/123` refresh | SPA `try_files … /index.html` missing |

---

## Rollback

**Clinics** — no DB rollback needed (it cannot alter the schema):

```bash
cd /opt/zenohosp/clinics && git checkout <previous-sha>
cd /opt/zenohosp && docker compose up -d --build clinics-backend
```

**Directory** — `git revert 6674653 && git push` (CI redeploys). Pre-change
file backups are also at `/root/*.bak`. Note that reverting leaves the
`users.can_access_clinics` column and `Clinics` module row in place; both are
inert once nothing reads them.

Compose file backups: `/opt/zenohosp/docker-compose.yml.bak.*`
