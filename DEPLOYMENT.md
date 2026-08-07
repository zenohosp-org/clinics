# Clinics — production runbook

Target: **https://clinics.zenohosp.com** (SPA) and
**https://api-clinics.zenohosp.com** (Spring Boot, port 9003), on the existing
`/opt/zenohosp` VPS alongside HMS, labs, pharmacy and directory.

Work through the stages in order. Stage 1 gates everything else: **clinics SSO
cannot work until Directory knows about `clinics-client`.**

---

## Stage 0 — DNS

Add two A records pointing at the same VPS IP as `hms.zenohosp.com`:

```
clinics.zenohosp.com.      A    <VPS_IP>
api-clinics.zenohosp.com.  A    <VPS_IP>
```

Verify before continuing — certbot will fail otherwise:

```bash
dig +short clinics.zenohosp.com api-clinics.zenohosp.com
```

---

## Stage 1 — Register the clinics OAuth2 client in Directory

The Directory source at `~/directory` has **already been patched** with the
clinics registration:

- `directory-backend/.../service/OAuth2AuthorizationService.java`
  — added `clinicsClientId` / `clinicsClientSecret` / `clinicsRedirectUri`
  `@Value` fields and a `clientRegistry.put(clinicsClientId, …)` entry.
- `directory-backend/src/main/resources/application.properties`
  — added the `oauth2.client.clinics.*` block.

Those changes compile but are **not deployed**. To ship them:

1. Choose a strong client secret (do not keep the `clinics-secret-key-2026`
   default):

   ```bash
   openssl rand -base64 36
   ```

2. Add it to `/opt/zenohosp/.env` on the VPS:

   ```bash
   OAUTH_CLINICS_CLIENT_ID=clinics-client
   OAUTH_CLINICS_CLIENT_SECRET=<the generated secret>
   OAUTH_CLINICS_REDIRECT_URI=https://api-clinics.zenohosp.com/login/oauth2/code/directory
   ```

3. Redeploy the directory service and confirm the registry log line lists
   `clinics-client`:

   ```bash
   docker compose up -d --build directory-backend
   docker compose logs directory-backend | grep "OAuth2 clients registered"
   ```

> The `redirect-uri` must match the clinics backend's `OAUTH_REDIRECT_URI`
> **byte for byte**, including scheme and trailing path. A mismatch surfaces as
> an opaque `invalid_grant` at the token exchange.

---

## Stage 2 — Check out the repo on the VPS

```bash
cd /opt/zenohosp
git clone https://github.com/KarthiZenoHosp/clinics.git
```

The deploy workflows `cd /opt/zenohosp/clinics && git pull origin main`, so the
directory name must be exactly `clinics`.

---

## Stage 3 — Environment variables

Append to `/opt/zenohosp/.env`. `DB_*`, `JWT_SECRET` and `GOOGLE_*` are already
there for HMS — clinics reuses the same values (same database, same signing
secret). Only the clinics-specific OAuth entries from Stage 1 are new.

```bash
# Already present for HMS — clinics shares them verbatim.
# DB_URL / DB_USER / DB_PASS
# JWT_SECRET               ← must equal what Directory signs with
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

# New for clinics (Stage 1)
CLINICS_CLIENT_ID=clinics-client
CLINICS_CLIENT_SECRET=<same secret as OAUTH_CLINICS_CLIENT_SECRET>
```

`JWT_SECRET` mismatching Directory's is the single most common cause of a
"logs in, then instantly bounces back to /login" loop: the cookie is set, but
every `/api/auth/me` fails signature validation and returns 401.

---

## Stage 4 — Add the compose service

Merge the `clinics-backend` block from
[`deploy/docker-compose.clinics.yml`](deploy/docker-compose.clinics.yml) into
the `services:` map of `/opt/zenohosp/docker-compose.yml`.

It must live in that file specifically — the deploy workflow runs
`docker compose up -d --build clinics-backend` from `/opt/zenohosp`.

The service binds `127.0.0.1:9003:9003` on purpose: nginx is the only thing
that should reach it. Then:

```bash
cd /opt/zenohosp
docker compose up -d --build clinics-backend
docker compose logs -f clinics-backend        # wait for "Started ClinicsApplication"
curl -s localhost:9003/actuator/health        # {"status":"UP"}
```

---

## Stage 5 — nginx + TLS

```bash
# Shared proxy snippet (sets X-Forwarded-Proto — required for OAuth redirect_uri)
sudo mkdir -p /etc/nginx/snippets
sudo cp /opt/zenohosp/clinics/deploy/nginx/clinics-proxy.conf /etc/nginx/snippets/

# Vhosts
sudo cp /opt/zenohosp/clinics/deploy/nginx/clinics.zenohosp.com.conf \
        /etc/nginx/sites-available/clinics.zenohosp.com
sudo cp /opt/zenohosp/clinics/deploy/nginx/api-clinics.zenohosp.com.conf \
        /etc/nginx/sites-available/api-clinics.zenohosp.com
sudo ln -sf ../sites-available/clinics.zenohosp.com     /etc/nginx/sites-enabled/
sudo ln -sf ../sites-available/api-clinics.zenohosp.com /etc/nginx/sites-enabled/

# Web root for the SPA
sudo mkdir -p /var/www/clinics
```

Both vhosts reference `/etc/letsencrypt/live/...` certificates that do not
exist yet, so `nginx -t` will fail until certbot has run. Issue the
certificates first — certbot manages its own temporary config:

```bash
sudo certbot --nginx -d clinics.zenohosp.com -d api-clinics.zenohosp.com
sudo nginx -t && sudo systemctl reload nginx
```

---

## Stage 6 — GitHub Actions

In **Settings → Secrets and variables → Actions** on
`KarthiZenoHosp/clinics`, add the same three secrets the HMS repo uses:

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | deploy user (the one owning `/opt/zenohosp`) |
| `VPS_SSH_KEY` | private key whose public half is in that user's `authorized_keys` |

After that, a push to `main` touching `clinics-backend/**` rebuilds the
container, and one touching `clinics-frontend/**` rebuilds the SPA into
`/var/www/clinics`.

First deploy can be triggered by hand:

```bash
cd /opt/zenohosp/clinics/clinics-frontend
npm ci && npm run build
sudo rm -rf /var/www/clinics/* && sudo cp -r dist/* /var/www/clinics/
```

---

## Stage 7 — Verify the SSO round trip

1. Open `https://clinics.zenohosp.com` → should redirect to `/login`.
2. Click **Sign in with ZenoHosp Directory**.
   Browser goes `clinics.zenohosp.com/oauth2/authorization/directory`
   → nginx → backend → `api-directory.zenohosp.com/oauth2/authorize`.
3. After consent, Directory redirects to
   `https://api-clinics.zenohosp.com/login/oauth2/code/directory`.
4. Backend exchanges the code, sets the HttpOnly `sso_token` cookie on
   `.zenohosp.com`, and redirects to `https://clinics.zenohosp.com/sso/callback`.
5. The callback page calls `/api/auth/me` and lands you on `/dashboard`.

Cross-app check: sign out of clinics, then reload an open HMS tab — it should
drop to its login screen within ~30s. Both apps poll `/auth/me` on that
interval and force-logout on the first 401, which is how a logout in one
zenohosp app propagates to the rest.

### If it fails

| Symptom | Cause |
|---|---|
| `invalid_grant` at callback | `OAUTH_REDIRECT_URI` ≠ Directory's registered `redirect-uri` |
| Login loops back to `/login` | `JWT_SECRET` differs from Directory's |
| `redirect_uri` is `http://` not `https://` | `X-Forwarded-Proto` missing — the proxy snippet isn't included |
| CORS error in console | origin absent from `SecurityConfig.corsConfigurationSource()` |
| 404 on `/patients/123` refresh | SPA fallback missing — check `try_files … /index.html` |

---

## Rollback

```bash
cd /opt/zenohosp/clinics
git log --oneline -5
git checkout <previous-sha>
cd /opt/zenohosp && docker compose up -d --build clinics-backend
```

No database rollback is needed: clinics runs `ddl-auto=none` and cannot alter
the shared schema. That is also why the clinics deploy workflow omits the
pre-deploy `pg_dump` gate that HMS's workflow performs — **if clinics is ever
switched to `ddl-auto=update`, restore that gate first.**
