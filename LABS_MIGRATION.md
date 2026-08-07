# Labs migration — phased plan

Tracks the multi-session migration of radiology + health-checkups from HMS into
the labs service (`labs.zenohosp.com` / port 8086 locally,
`api-labs.zenohosp.com` in prod), plus the reverse arrangement for
hospital-services (labs proxies HMS). Each domain ends up with exactly one
owner of data + writes; the other app proxies when it needs UI.

| Domain              | Data owner | HMS UI                | Labs UI               |
| ------------------- | ---------- | --------------------- | --------------------- |
| Health Checkups     | Labs       | ✅ via HMS → labs proxy| ✅ direct             |
| Radiology / Lab Ord | Labs       | ❌ removed (link out)  | ✅ direct             |
| Hospital Services   | HMS        | ✅ direct             | ✅ via labs → HMS proxy|

DB stays shared (single `zenohosp` Postgres). Rows are not migrated; only the
code path changes. Phases / chunks are committed independently so any one can
be reverted in isolation.

---

## Phase A — Backend config + LabsClient infrastructure (DONE)

Local commit: `b1901f7`. Additive, zero behavioural change.

- `SecurityConfig` CORS now allows `labs.zenohosp.com`, `api-labs.zenohosp.com`,
  `localhost:5173/5175`.
- `application.properties`: `labs.api.url=${LABS_API_URL:http://localhost:8086}`.
- `JwtAuthFilter`: raw JWT preserved in `Authentication.credentials` so
  downstream services can forward identity to labs. Matches OTM + labs precedent.
- `integration/LabsClient.java` + three DTOs under `integration/dto/`. Two methods:
  `createHealthCheckupBooking(LabsCheckupBookingRequest, jwt)` and
  `getPendingRadiologyOrders(hospitalId, jwt)`.

---

## Phase B — Frontend routes radiology + checkup to labs (DONE)

Local commit: `acfd8b8`. Plus the defensive frontend fix `81d1316`.

- `vite.config.js`: `/labs-api` proxy → `localhost:8086` with `/labs-api → /api`
  rewrite. Same-origin in dev keeps SSO cookie alive.
- `.env.example`: `VITE_LABS_API_URL=/labs-api`. Prod sets the absolute URL.
- `src/utils/api.js`: new `labsApi` axios instance mirroring `api`'s auth model.
  `radiologyApi` (8 methods) + `checkupApi` (12 methods) now route through it.
  Every other API wrapper untouched.

Defensive fixes shipped after labs-down testing surfaced two latent issues:
- `AppointmentsDashboard.jsx`: `appt.status.replace(...)` and `appt.apptTime
  .substring(...)` now null-safe so the backend's defensive converter
  (`AppointmentStatusConverter` returning null for unknown ids) doesn't crash
  the row.
- `BookAppointmentModal.jsx`: `Promise.all` no longer treats labs as a SPOF —
  `checkupApi.getPackages` wrapped in `.catch(() => [])` so a labs outage leaves
  the doctor with an empty package list, not a broken modal.

---

## Phase C — Backend cross-cuts route through LabsClient (DONE)

Local commit: `0daa47d`. Behaviour preserved.

- `SmartBillingService`: dropped `RadiologyOrderRepository`, fetches pending
  radiology from labs. JWT pulled from `Authentication.credentials`. Two-caller
  asymmetry handled: HTTP path (`BillingController`) gets real data; scheduled
  path (`InvoiceSyncScheduler`) returns empty radiology because
  `computeEstimatedTotal` never reads it anyway.
- `AppointmentService`: dropped `HealthCheckupService`, calls
  `labsClient.createHealthCheckupBooking`. Booking is re-fetched via
  `HealthCheckupBookingRepository` to satisfy the `@ManyToOne` on `Appointment`
  — re-fetch disappears in Phase D when the relationship flattens to a UUID.

---

## Push gate

Local main is N commits ahead of `origin/main`. **Push only after**:

1. Labs is live at `http://localhost:8086` AND in prod at
   `https://api-labs.zenohosp.com`.
2. Browser-verified end-to-end:
   - Appointment booking with a checkup package → labs receives the POST,
     HMS reads back the entity, FK set.
   - IPD finalize modal opens → labs serves radiology suggestions.
   - Radiology + checkup pages render and the CRUD flows work end-to-end.
3. Labs Claude confirms their side is deployed.

If any of the above fails, revert path is per-phase:
```bash
git reset --hard 0daa47d   # keep through Phase C
git reset --hard acfd8b8   # keep through Phase B
git reset --hard b1901f7   # keep through Phase A
git reset --hard 98ba1e0   # drop the whole migration
```

---

## Chunk 1 — HMS proxies labs for checkups, drops radiology backend (DONE)

Local commit: `61092db`. Replaces Phase D's plan with a one-shot
restructure on the HMS side.

- `Appointment.checkupBooking` `@ManyToOne HealthCheckupBooking` →
  `checkupBookingId` `@Column UUID`. DB column type + FK stay; only the
  Java-side join goes away.
- `AppointmentDto`: drops `checkupBookingNumber` + `checkupPackageName`
  from the wire shape (the denormalised reads off the `@ManyToOne` are
  unsourceable now). Frontend keeps `checkupBookingId` for navigation
  on the appointments row.
- `AppointmentService.createAppointment`: re-fetch via
  `HealthCheckupBookingRepository` is gone — just stores the UUID labs
  returned. Repository injection removed.
- `InvoiceService`: deletes `billRadiologyOrder()` + `billCheckupBooking()`
  and the three "mark RADIOLOGY items as BILLED" stream blocks in
  `createInvoice`, `finalizeIPDInvoice`, `collectAndSave`. Labs owns the
  radiology lifecycle; HMS no longer flips order statuses.
- New `labsClient.proxyJson(method, path, queryString, body, jwt)` —
  generic forwarder. Path / query / body / JWT preserved verbatim; labs'
  status + body echoed back.
- New `HealthCheckupProxyController` at `/api/health-checkups/**` —
  RequestMapping wildcard hands the request off to `proxyJson`. All 12
  checkup endpoints flow through.
- Deletes (all confirmed unused at this commit): RadiologyController,
  HealthCheckupController, RadiologyService, HealthCheckupService,
  HealthPackageRepository, HealthCheckupBookingRepository,
  RadiologyOrderRepository, and 8 entity/DTO/converter classes.

Tables (`radiology_orders`, `health_packages`, `health_package_tests`,
`health_checkup_bookings`, `health_checkup_results`) stay in the shared
DB — Hibernate just stops mapping them.

## Chunk 2 — HMS frontend checkupApi back to HMS api (DONE)

Local commit: `3c8dc8c`. Pairs with Chunk 1.

`checkupApi`'s 12 methods now travel:
```
HMS frontend → hms.zenohosp.com/api/health-checkups/*
             → HealthCheckupProxyController
             → api-labs.zenohosp.com/api/health-checkups/*
```

Single-origin in the SPA (single SSO cookie, single log stream, single
rate-limit / observability point).

## Chunk 4 — Remove radiology UI from HMS, add Labs external link (DONE)

Local commit: `38f71b1`. Frontend rationalisation matching the backend
deletes.

- Deletes `src/pages/radiology/*` (5 page + modal files).
- Drops the 4 radiology route registrations + lazy imports from
  `App.jsx`.
- Sidebar: drops `RADIOLOGY_LINKS`, `radiologyEnabled` read, `radOpen`
  state, `radActive`, accordion render, and the `ScanLine` / `FileText`
  icon imports. Adds `Labs` to `EXTERNAL_APPS` as the first entry
  (labs.zenohosp.com, `FlaskConical` icon).

Kept: `radiologyApi` in `utils/api.js` — still routes to `labsApi` for
the read-only integration points (`FinalizeIPDBillingModal` radiology
line items, `IPDDetailPane` radiology widget, `ViewBillingModal`
historical line items, `PrintConsultation` radiology results). Those
are clinical/billing context inside HMS pages, not standalone
radiology UI.

(Chunk 3 was folded into Chunk 1 — radiology backend deletions
happened in the same commit as the checkup proxy.)

## Hospital-services proxy — labs side (DONE per labs Claude)

Labs delivered the reverse arrangement: hospital_services data + writes
stay in HMS; labs proxies the same routes through to HMS.

Labs-side changes (acknowledged by labs Claude):
- Deletes labs' `HospitalService` entity / controller / service / repo /
  DTO (5 files).
- Adds `HospitalServicesProxyController` — 5 routes (GET, POST, PUT,
  DELETE, PATCH /toggle-status), JWT forwarded as
  `Authorization: Bearer`, body passed as `byte[]` for transparency.
- Adds `RestTemplateConfig` backed by Java 11+ `HttpClient` /
  `JdkClientHttpRequestFactory`. **Note for future cross-app forwarders:**
  the default `SimpleClientHttpRequestFactory` uses `HttpURLConnection`
  which silently fails on PATCH. Reuse the JDK factory pattern.
- Config: `hms.api.url=${HMS_API_URL:http://localhost:9001}`.
  Prod env var: `HMS_API_URL=https://api-hms.zenohosp.com`.

Labs verified via curl: full CRUD round-trip through the proxy against
HMS — GET/POST/PUT/PATCH/DELETE all succeed; rows show up correctly in
HMS DB; 401 fires before proxy when JWT is missing. Boot logs confirm
labs no longer maps `hospital_services` at all.

Two contract notes (non-breaking) flagged by labs:
1. `DELETE /{id}` is idempotent — HMS's `repository.deleteById` doesn't
   throw on missing id, so a stale UUID returns 204 rather than 404. If
   HMS ever wants 404-on-missing-id, change HMS; labs mirrors.
2. `PATCH /toggle-status` returns 204 (empty body) — matches HMS's
   existing controller. Labs frontend's `hospitalServiceApi` already
   ignores the body.

No HMS-side change needed for this arrangement — HMS's existing
`HospitalServiceController` keeps serving the routes; labs forwards to
it. The labs frontend's only hospital-services touchpoint
(`NewOrderModal.jsx` reading the list via the proxy) is verified
working.

## Phase D — Delete obsolete HMS code (NOT STARTED — superseded by Chunks 1-4)

Runs only after Phase C is verified in prod. Per-phase commits will mirror A/B/C.

### Backend deletions

- `controller/RadiologyController.java`
- `controller/HealthCheckupController.java`
- `service/RadiologyService.java`
- `service/HealthCheckupService.java`
- `repository/RadiologyOrderRepository.java`
- `repository/HealthPackageRepository.java`
- `repository/HealthCheckupBookingRepository.java`
- `entity/RadiologyOrder.java`
- `entity/HealthPackage.java`
- `entity/HealthPackageTest.java`
- `entity/HealthCheckupBooking.java`
- `entity/HealthCheckupResult.java`
- `dto/CreateRadiologyOrderRequest.java`
- `dto/RadiologyOrderDTO.java`
- `dto/RadiologyReportRequest.java`
- Enums used only by the above: `RadiologyStatus`, `PackageCategory`,
  `BookingStatus`, etc. (verify no surviving callers via grep before each
  deletion).

### Entity surgery (critical — would break HMS compile if missed)

`Appointment.java:80-82` currently:

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "checkup_booking_id")
private com.zenlocare.HMS_backend.entity.HealthCheckupBooking checkupBooking;
```

Phase D flattens this to:

```java
@Column(name = "checkup_booking_id")
private UUID checkupBookingId;
```

`ddl-auto=update` will not drop the FK constraint at the DB level (it never
drops constraints), so labs and HMS both continue to honour the same FK over
the shared row. The Java side just stops loading the related entity.

`AppointmentService.createAppointment` then drops the re-fetch:

```java
// before (Phase C interim)
checkupBooking = healthCheckupBookingRepository.findById(created.getId())
        .orElseThrow(...);
.checkupBooking(checkupBooking)

// after Phase D
.checkupBookingId(created.getId())
```

`AppointmentDto` serialises `checkupBookingId` as a flat UUID instead of a
nested object. **Before committing**, audit HMS frontend for any reads of
`appointment.checkupBooking.*` — if found, decide whether (a) the
appointment page becomes leaner (full detail on labs side) or (b) HMS does
one labs fetch during DTO serialisation. See ack from prior session for
context.

### Cleanup in InvoiceService

Delete `billRadiologyOrder()` and `billCheckupBooking()` (lines ~1043-1132 and
~1153-1225 — line numbers will have drifted; locate by method name).
Remove the `RadiologyOrderRepository` and `HealthCheckupBookingRepository`
injections. Keep everything else in `InvoiceService` untouched.

### Do NOT touch

- `invoice_items.radiology_order_id` column. Past invoices still reference it;
  labs continues to populate it for new rows. Hibernate ignores DB columns
  whose entity fields are removed — that's the desired state.
- `invoice_items` health-checkup FK columns (same reasoning).
- Patient, Doctor, Admission, OT, pharmacy, asset, inventory entities.
- `HospitalService` — dual-write target. Stays in HMS.
- `PatientService` — out of scope.
- DataSeeder / DB schema / migrations beyond what's described above.

---

## Phase E — Frontend rationalisation (NOT STARTED, scheduled ~1-2 weeks after Phase D)

Runs only after labs UI has been exercised in production and confirmed
feature-complete vs HMS's current radiology + checkup pages. Goal: remove the
duplicated pages from HMS so labs is the single source of truth for those UIs,
matching the ecosystem pattern (pharmacy / OT / asset / inventory / finance are
already separate apps surfaced via the sidebar's "Other Apps" section).

### Pages to delete

- `src/pages/radiology/RadiologyQueue.jsx`
- `src/pages/radiology/RadiologyReports.jsx`
- `src/pages/checkups/CheckupBookings.jsx`
- `src/pages/checkups/PackageManager.jsx`
- Their route entries in the router

### Sidebar updates

`src/components/layout/Sidebar.jsx`:
- Remove `RADIOLOGY_LINKS` (Imaging Queue, Reports) accordion.
- Remove `CHECKUP_LINK` from the main nav.
- Remove `Packages` from `SETTINGS_LINKS` (it links to a checkup-package page).
- Add to `EXTERNAL_APPS`:
  - `{ label: "Labs", href: "https://labs.zenohosp.com", icon: ScanLine }`

### Redirects (one release cycle for backward compatibility)

Before deleting the routes outright, add a redirect layer in `App.jsx` or the
router so deep-links keep working:

```jsx
<Route path="/radiology/*" element={
  <Redirect to="https://labs.zenohosp.com/radiology/*" external />
} />
<Route path="/checkups/*" element={
  <Redirect to="https://labs.zenohosp.com/checkups/*" external />
} />
```

Ship the redirect first. After staff have adapted (1-2 weeks), delete the
route handlers and the redirect layer.

### What stays in HMS (DO NOT delete in Phase E)

These are thin integration points, not page-level CRUD. Keep them:

| File | Why |
|---|---|
| `components/modals/BookAppointmentModal.jsx` (checkup package dropdown) | Booking flow is HMS's domain; reads labs as data source. |
| `components/modals/FinalizeIPDBillingModal.jsx` (radiology line items) | IPD billing is HMS's domain. |
| `pages/admin/IPDDetailPane.jsx` (radiology widget) | Read-only clinical context on admission. |
| `pages/admin/ViewBillingModal.jsx` (radiology line items) | Display of billed labs items. |
| `pages/print/PrintConsultation.jsx` (radiology results) | Print/export needs the data inline. |

These stay because they're read-only or thin-write workflows where labs is
purely a data source, not the UI surface.

### Push gate for Phase E

1. Labs has been live in prod ≥ 1 week without rollback.
2. Staff have confirmed labs UI covers everything they did in HMS.
3. Bookmarks / external links to old HMS routes have been audited (search
   wiki, Slack pins, etc.) and either updated or covered by redirects.

---

## Open contract diffs (informational)

Labs flagged two divergences from a bit-for-bit HMS contract during Phase A
review. Both are aesthetic / minor and don't block migration:

1. `referredByName` and `createdByName` on `RadiologyOrderDTO` carry the SSO
   email instead of "FirstName LastName" because the JWT doesn't currently
   include name claims. Proper fix is a Directory JWT claim addition — tech
   debt logged but not gating.
2. Labs reads `hospitalId` from the JWT claim directly instead of casting the
   principal to a `User` and reading `User.hospital.getId()`. Same effective
   value for legitimate sessions; faster path.

---

## Quick state check

```bash
cd /Users/karthikeyan-zc034/HMS/HMS
git log --oneline origin/main..main   # what's local-only
git status -sb                        # working tree
```

Last updated for the migration: end of Phase C session.
