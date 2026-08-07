# ZenoHosp Clinics

Clinic management for outpatient-first practices. Same feature set as HMS —
patients, appointments, consultations, prescriptions, billing, investigations,
rooms, blood bank, biomedical waste — reshaped around how a clinic actually
runs its day.

| | |
|---|---|
| Frontend | `clinics-frontend` — React 18, Vite 5, React Router 6, plain CSS (no Tailwind) |
| Backend | `clinics-backend` — Spring Boot 3, Java 21, Maven |
| Database | PostgreSQL (Supabase) — **shared with HMS** |
| Auth | SSO via ZenoHosp Directory (OAuth2 authorization code → HttpOnly `sso_token`) |
| Production | https://clinics.zenohosp.com · https://api-clinics.zenohosp.com |

## Ports

Clinics deliberately avoids every port already taken by a sibling app.

| Service | Dev port | Production |
|---|---|---|
| clinics-backend | `9003` | `127.0.0.1:8110` (container listens on 8080) |
| clinics-frontend | `5177` | static, served by nginx from `/var/www/clinics` |

Dev neighbours: 9000 directory · 9001 HMS · 9002 people (backends);
5173 pharmacy · 5174 HMS/finance · 5175 labs · 5176 people (frontends).

In production every zenohosp backend listens on **8080 inside its container**
and publishes to a unique `127.0.0.1:81xx`. The `EXPOSE 9003` in the Dockerfile
is cosmetic — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Running locally

```bash
./run_backend.sh     # Spring Boot on :9003, profile=local
./run_frontend.sh    # Vite on :5177, proxies /api → :9003
```

Both need one-time setup:

```bash
# Backend — real credentials, gitignored, never commit
cp clinics-backend/src/main/resources/application.properties \
   clinics-backend/src/main/resources/application-local.properties
# then fill in the DB url/user/pass and jwt.secret

# Frontend
cp clinics-frontend/.env.example clinics-frontend/.env.local
```

`VITE_DEV_MOCK_AUTH=true` in `.env.local` bypasses SSO with a fixed dev
identity. It is hard-gated to `localhost` in `src/utils/devMockAuth.js`, so a
stray `true` cannot leak a fake identity into a deployed build.

## Repository layout

```
clinics-backend/     Spring Boot API — com.zenlocare.clinics
clinics-frontend/    React SPA
  src/components/ui/   design-system primitives (Button, Table, Modal, …)
  src/context/         Auth, Notification, Theme, ReferenceData, FeatureFlags
  src/hooks/           shared hooks
  src/pages/           routed pages
  src/styles/          tokens → system → utilities → per-module CSS
deploy/              nginx vhosts + docker-compose service definition
DEPLOYMENT.md        production runbook
```

## The shared database

Clinics reads and writes **the same Supabase tables as HMS**. The two apps see
the same patients, appointments and invoices.

Because of that, clinics runs `spring.jpa.hibernate.ddl-auto=none` while HMS
runs `update`. HMS is the sole owner of the schema; clinics only ever moves
rows. Two services running `update` against one schema would race on boot and
let entity drift silently alter production columns.

A second guard matters just as much: `clinics.data-seeder.enabled=false`. The
inherited `DataSeeder` issues raw DDL outside Hibernate — column renames,
constraint drops, `CREATE TABLE` — which `ddl-auto=none` does **not** prevent.
It is disabled because HMS has already applied all of it to the shared
database.

**Consequence:** a schema change needed by a clinics feature has to land in
HMS's entities first, then clinics picks it up. Adding a column straight to a
clinics entity will fail at runtime, not at boot.

## Relationship to HMS

Clinics began as a clone of HMS (`Karthi-fluid-UI-UX`) and has diverged: the
Java package is `com.zenlocare.clinics`, ports and SSO client are its own, and
the dashboard is rewritten around the clinic day. It does not share git history
with HMS, so fixes do not flow automatically in either direction.

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — production runbook, DNS→TLS→first boot
- [Architecture.md](Architecture.md) — inherited system architecture
- [auth.md](auth.md) — inherited SSO design notes
- [schema.md](schema.md) — inherited data model
