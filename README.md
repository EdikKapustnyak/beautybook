# BeautyBook

Multi-tenant SaaS platform for beauty professionals: public landing pages,
online booking, calendar, CRM, SMS notifications, and subscriptions.

This repository currently contains **Stage 1 (Repository / Infrastructure)**
through **Stage 15-17 (OTP + SMS + Background Jobs)** of the implementation
plan in `beautybook-development-tasks.md`. The public booking flow (which
will finally give OTP and the public-facing SMS confirmation flow a real
caller) is added in a later stage, strictly in order.

## Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Admin**: Next.js (App Router), React, TypeScript, Tailwind CSS — separate app, separate deploy
- **Backend**: Node.js, Express, TypeScript (ESM), MongoDB/Mongoose
- **Infra**: MongoDB + Redis via `docker-compose.yml` for local dev; BullMQ, S3-compatible storage, Stripe, SMS provider added in later stages

## Repository layout

```text
beautybook/
├── apps/
│   ├── backend/     # Express API (ESM, strict TypeScript)
│   │   └── src/
│   │       ├── tenant/   # /api/tenant/* — public + tenant surface only
│   │       ├── admin/    # /api/admin/*  — platform admin surface only
│   │       └── config/   # env.ts — single source of truth for all secrets
│   ├── frontend/    # Next.js app (App Router, Tailwind) — public/tenant UI
│   └── admin/       # Next.js app (App Router, Tailwind) — platform admin UI
├── .github/workflows/ci.yml
├── .husky/pre-commit
├── eslint.config.js       # shared flat ESLint config
├── tsconfig.base.json     # shared strict TypeScript config
└── package.json           # npm workspaces root
```

### Why three apps in one repo

`apps/frontend` (public site + tenant dashboard) and `apps/admin` (platform
admin) are separate deployable Next.js apps, not one app with a protected
route. See discussion in `beautybook-security-measures.md` §2/§4/§21:

- Different audiences (customers/tenants vs. the SaaS owner's internal team).
- Independent deploys — `apps/admin` can sit behind its own subdomain,
  IP allowlist, or VPN without touching the public site.
- No shared JS bundle — a bug in the public frontend's dependency tree
  cannot pull in admin code or vice versa.

### Tenant/admin isolation in the backend — enforced, not just documented

`apps/backend/src/tenant/**` and `apps/backend/src/admin/**` each own their
JWT secrets, cookie name, and CORS allowlist (`src/tenant/config.ts` /
`src/admin/config.ts`, sourced from separate `env.ts` fields). This is backed
by a lint-level guarantee, not just a convention: the root `eslint.config.js`
has a `no-restricted-imports` rule that makes it a **lint error** for
`src/tenant/**` to import anything from `src/admin/**`, and vice versa. A
developer cannot accidentally wire a tenant route to an admin secret (or
share a cookie name) without CI failing on the `lint` job.

`app.ts` mounts the two surfaces under separate paths with separate `cors()`
instances (`/api/tenant/*`, `/api/admin/*`) — the public frontend's origin is
never implicitly trusted by admin endpoints, and vice versa. See
`src/__tests__/app.test.ts` for tests asserting this at the HTTP level.

### Database + tenant isolation (Stage 2)

- MongoDB via Mongoose. Local dev: `docker compose up -d` (see
  `docker-compose.yml`, MongoDB + Redis).
- `shared/tenantScope.ts` is the ONE sanctioned way to build a tenant-scoped
  Mongo filter (`withTenantScope`, `tenantScopedIdFilter`). It takes the
  `companyId` from the verified auth context and silently discards any
  `companyId` present in caller-supplied input — so even an accidental
  `Model.find({ ...req.query })` can't be used to spoof another tenant.
  See `shared/__tests__/tenantScope.test.ts`.
- Model validation is tested WITHOUT a live database using Mongoose's
  `validateSync()` (see `tenant/models/__tests__/*.model.test.ts`,
  `admin/models/__tests__/*.model.test.ts`) — schema bugs are caught in CI
  even before a DB integration test exists for that model.

### Authentication (Stage 3)

Tenant (`/api/tenant/auth/*`) and platform admin (`/api/admin/auth/*`) each
have a **fully separate** implementation — separate models, repositories,
services, controllers, routes, JWT secrets, and refresh-token cookies:

- `POST /register`, `/login` (tenant only — there is no public admin
  registration; platform admins are created via
  `npm run seed:admin --workspace=apps/backend`)
- `POST /refresh` — rotates the refresh token. If an already-rotated-out
  token is presented again (replay/theft), the **entire session family** for
  that user is revoked, not just the one request. See
  `tenant/services/__tests__/authService.test.ts` /
  `admin/services/__tests__/adminAuthService.test.ts`.
- `POST /logout`, `/logout-all`
- `POST /forgot-password`, `/reset-password` (tenant only) — identical
  response whether or not the email exists (no enumeration); the reset
  token is only ever logged server-side in development, never returned in
  the HTTP response.

Passwords are hashed with bcrypt (`shared/security/password.ts`). Refresh
and password-reset tokens are opaque random values — only their SHA-256
hash is ever stored (`shared/security/tokens.ts`), so a database leak alone
doesn't let an attacker use them. Access tokens are short-lived JWTs, never
persisted server-side.

`authService`/`adminAuthService` depend only on small repository **port**
interfaces (`tenant/repositories/types.ts`, `admin/repositories/types.ts`),
not on Mongoose directly — the Mongo-backed implementations
(`*RepositoryAdapters.ts`) are swapped for in-memory fakes in tests
(`**/services/__tests__/inMemoryPorts.ts`). This is what makes the rotation
and reuse-detection logic fully unit-testable without a live database.

### Company profile CRUD + RBAC (Stage 4/6)

- `GET /api/tenant/company` — any authenticated tenant role.
- `PATCH /api/tenant/company` — **owner/admin only** (`requireTenantRole`
  server-side gate; frontend hiding is never treated as a security
  control, per `beautybook-security-measures.md` §5). `companyId` is
  always taken from `req.tenantAuth.companyId` (the verified access
  token), never from the request body/params.
- Updatable fields: `name`, `description`, `logo`, `coverImage`,
  `timezone`, `currency`, `bookingSettings`. `slug`, `status`, and
  `subscriptionId` are deliberately NOT accepted here — slug changes
  affect the public URL and need a dedicated flow, status/subscription are
  platform-admin/Stripe-webhook-only. The Zod schema uses `.strict()` so
  any other unexpected field (e.g. `companyId`, `_id`) is rejected outright
  rather than silently ignored — defense in depth against mass-assignment.
- `description` is validated as plain text (rejects `<`/`>`), `logo`/
  `coverImage` are validated against an http(s)-only scheme allowlist
  (rejects `javascript:`, `data:`, etc.) — see
  `shared/validation/{plainText,safeUrl,timezone}.ts`, all unit-tested.
- `bookingSettings` updates are a **partial merge**, not a raw Mongoose
  subdocument replace: `companyService.updateCompany` fetches the current
  settings and merges the patch in before writing, so e.g. patching only
  `minNoticeMinutes` doesn't silently reset `allowOnlineCancel` and the
  other fields to their schema defaults. See
  `tenant/services/__tests__/companyService.test.ts`.
- The RBAC gate itself (`requireTenantAuth`/`requireTenantRole`) is
  unit-tested directly — anonymous, malformed token, wrong secret (e.g. an
  admin token against a tenant route), expired token, and every
  role-vs-route combination — without needing a database, in
  `tenant/middleware/__tests__/requireTenantAuth.test.ts`.
- **Known accepted tradeoff**: role/status checks come from the access
  token's claims, which are only refreshed every `JWT_ACCESS_TOKEN_TTL_SECONDS`
  (15 min by default). Disabling a user or changing their role takes up to
  that long to take effect on already-issued access tokens. This is a
  deliberate MVP tradeoff (avoids a DB round-trip on every request); revisit
  before Stage 22 (Platform Admin) if faster propagation becomes a
  requirement — see `beautybook-security-measures.md` §28.

### Employees + Services (Stage 5/7)

- `GET/POST /api/tenant/employees`, `GET/PATCH/DELETE /api/tenant/employees/:id`
- `GET/POST /api/tenant/services`, `GET/PATCH/DELETE /api/tenant/services/:id`
- RBAC: **read** (GET) is open to any authenticated tenant role; **write**
  (POST/PATCH/DELETE) requires `owner`, `admin`, or `manager` — documented
  assumption, since the source spec docs don't give an explicit
  employee/service permission matrix. Revisit if that assumption turns out
  wrong.
- **Employee vs. TenantUser**: deliberately separate models. `Employee` is
  the business/roster entity used by the calendar and booking engine
  (name, contact info, which services they perform); `TenantUser` is the
  login/auth account. Not every staff member needs a login (e.g. a
  contractor whose calendar the owner manages), and not every login is a
  bookable staff member (e.g. a back-office `admin`). `Employee.userId` is
  an optional link between the two when both exist. `workingHours` was
  added to `Employee` in Stage 8, below.
- **Cross-tenant reference validation**: `Service.employeeIds` and
  `Employee.serviceIds` are each checked against the caller's OWN company
  before being saved (`employeeRepository.findInvalidIdsForCompany` /
  `serviceRepository.findInvalidIdsForCompany`) — an id that's
  well-formed but belongs to another tenant is rejected with the same
  generic "invalid" message as an id that doesn't exist at all, so the
  error response never confirms whether a given id exists in someone
  else's company (dev-tasks.md §7: "cross-tenant employee").
- **Validation** (`tenant/validation/{service,employee}Schemas.ts`, mirrored
  in the Mongoose schemas as defense in depth): negative/zero price
  rejected, price limited to 2 decimal places, duration bounded to
  1–480 minutes, buffer 0–240 minutes, description checked for raw HTML,
  all list endpoints paginated with a bounded `limit` (max 100) via the
  new shared `shared/validation/pagination.ts`. Every create/update schema
  uses `.strict()` — `companyId`/`_id`/other unexpected fields in the
  request body are rejected outright (mass-assignment defense), matching
  the pattern established for Company.
- Repositories follow the simpler `withTenantScope`-based CRUD pattern
  (matching `userRepository.ts`) rather than the DI-port/adapter pattern
  used for auth — these are plain tenant-scoped CRUD with no
  atomicity/rotation concerns, so the extra indirection isn't warranted
  here. Model validation is tested without a live DB via `validateSync()`;
  Zod schemas are tested directly; full cross-reference behavior (which
  needs a real DB to actually resolve ids) is covered by the `mongodb`
  service container in CI, not locally in this sandbox.

### Working Hours + Blocked Time (Stage 8)

- `Employee.workingHours` — a per-employee weekly template of working
  periods and breaks, in company-local wall-clock time (`"HH:mm"`, 24h).
  Updating it is always a **full replace of the whole week** (not a
  per-day patch) — sending `{ monday: [...] }` sets Monday and leaves every
  other day empty, it does NOT merge with whatever was there before. This
  is a deliberate design choice to avoid the subdocument-replace footgun
  documented for `Company.bookingSettings`, on the assumption a schedule
  editor UI saves the whole week as one unit. Validated in two places for
  defense in depth: the Zod schema (`tenant/validation/employeeSchemas.ts`)
  and a Mongoose custom validator on the model, both backed by the same
  pure function (`shared/validation/workingHours.ts`, framework-free, unit
  tested directly — 16 tests covering overlapping periods, overlapping
  breaks, a break falling outside its period, and rejecting
  midnight-crossing periods).
- **Scope decisions, stated explicitly**: overnight/midnight-crossing
  periods (e.g. `22:00`–`02:00`) are rejected outright — not supported in
  this MVP; a period must end after it starts on the same calendar day.
  There's no separate "company default schedule" concept — each
  `Employee` has its own explicit schedule (a "copy hours to new
  employee" convenience can be a client-side/UI feature later without a
  backend concept change). DST correctness is **not** this stage's
  concern: this stage validates and stores a wall-clock weekly template;
  projecting that template onto real calendar dates (where DST actually
  matters) happens in the availability engine, dev-tasks.md §9.
- `BlockedTime` (new model) — either company-wide (holiday, whole business
  closed) when `employeeId` is unset, or specific to one employee (their
  day off) when it's set. A "blocked day" isn't a separate concept from a
  "blocked interval" — it's just an interval spanning the full day, per
  technical-spec.md §3's shape.
- `GET/POST /api/tenant/blocked-time`, `DELETE /api/tenant/blocked-time/:id`
  — same RBAC as Employees/Services (read = any role, write = owner/
  admin/manager). `employeeId`, when provided, is validated against the
  caller's own company with the same generic-error, no-enumeration
  pattern used for `Service.employeeIds`. Creating an interval that has
  already fully elapsed is rejected (dev-tasks.md §8 "past dates" check).
  Listing supports `employeeId`/`from`/`to` filters with an interval
  overlap query (`startAt < to AND endAt > from`), paginated.

### Availability Engine (Stage 9)

- `GET /api/tenant/availability?employeeId=&serviceId=&date=` — returns
  the bookable slots for one employee, one service, on one calendar date.
  Any authenticated tenant role can read it (this is the staff-facing
  calendar view; the public, unauthenticated customer-facing endpoint,
  `GET /public/:slug/availability` per technical-spec.md's Public API, is
  a separate later stage).
- `tenant/services/availabilityEngine.ts` — a pure, framework-free
  function (`calculateAvailableSlots`) implementing technical-spec.md §8
  steps 5-11: apply working hours → apply breaks → apply blocked
  intervals → apply existing bookings → apply duration+buffer → generate
  candidate slots → remove conflicts → return DTO-shaped slots. No
  Mongoose/Express import, so it's directly unit-testable and safe to
  reuse for the booking-creation server-side recheck in the next stage
  (dev-tasks.md §10 explicitly requires that recheck to happen again at
  booking time, never trusting a slot list the frontend fetched earlier).
- **DST correctness** uses `luxon` rather than hand-rolled date math —
  working-hours times are wall-clock (`"HH:mm"`) in the company's IANA
  timezone; converting them to UTC instants for a specific calendar date
  is exactly the kind of calculation that's easy to get subtly wrong
  around DST transitions by hand. Verified with real Europe/Oslo
  transition dates for both directions (spring-forward and fall-back) in
  `tenant/services/__tests__/availabilityEngine.test.ts` (26 tests) —
  covering every item in dev-tasks.md §9's critical test list: normal
  slot, exact boundary (touching = allowed, 1-minute overlap = rejected),
  break exclusion, blocked interval, fully blocked day, service longer
  than the free period, buffer reservation, split shifts, timezone
  conversion, and DST.
- **`bookedIntervals` is currently always empty.** The engine's interface
  already accepts existing bookings to subtract from availability, but
  the `Booking` model doesn't exist yet — that's dev-tasks.md §10
  (Booking creation), the very next stage. Once it lands, the controller
  needs exactly one more repository query, shaped identically to
  `blockedTimeRepository.listForEmployeeAvailability` (already used
  here for blocked time), and passes the results into the same
  `bookedIntervals` parameter the engine already has.
- Employee/service compatibility (technical-spec.md §8 step 4) is
  enforced: the requested employee must be active, the requested service
  must be active, and the employee must appear in `service.employeeIds`
  — otherwise a validation error, never an empty slot list (an empty list
  would look like "no availability today" instead of "this isn't a valid
  request").
- A single request is scoped to exactly one calendar date
  (`shared/validation/availabilitySchemas.ts`) — dev-tasks.md §18
  "Availability Abuse" calls out unbounded date-range requests as a DoS
  vector; a calendar UI fetches one date at a time instead.

### Booking Creation + Concurrency Protection (Stage 10)

This is the single most safety-critical stage in the whole plan
(dev-tasks.md §9/§10, security-measures.md §16): **double booking must be
mathematically impossible**, not just unlikely.

- `POST /api/tenant/bookings` — any authenticated tenant role (staff
  booking on behalf of a walk-in/phone customer). `GET` list/detail —
  same. `PATCH /api/tenant/bookings/:id/status` — owner/admin/manager
  only (documented assumption, matching the pattern used for
  Employees/Services/BlockedTime).
- **How double-booking is actually prevented** — a unique-index-based
  "atomic conditional reservation", one of the mechanisms
  security-measures.md §16 explicitly sanctions as an alternative to a
  multi-document transaction (which would require a replica-set MongoDB
  deployment; this works on a single standalone instance):
  1. A booking's time footprint (`[startAt, endAt + bufferMinutes)`) is
     broken into fixed-width cells (`tenant/services/slotLocking.ts`,
     `computeSlotCellKeys`). The core property this relies on — **any two
     overlapping intervals always share at least one cell, and touching
     (non-overlapping) intervals share none** — is directly unit tested.
  2. Reserving a booking = inserting one `SlotLock` document per cell for
     that employee. The **unique compound index on
     `(employeeId, cellKey)`** is the actual atomicity guarantee — when
     two concurrent requests both try to lock the same cell, MongoDB
     itself lets only one insert succeed. Application code just reacts to
     that outcome (`slotLockRepository.ts`), it doesn't implement the
     guarantee.
  3. **Reserve-before-create ordering**: `bookingService.createBooking`
     reserves the lock cells FIRST, using a pre-generated booking id, and
     only creates the `Booking` document after the reservation succeeds.
     A losing request never creates anything and needs no rollback —
     there's nothing to compensate.
  4. A losing request gets the exact error shape technical-spec.md §18
     shows as its example: `{"success":false,"error":{"code":"BOOKING_CONFLICT","message":"The selected time is no longer available."}}`.
- **Two layers, two different jobs.** Before attempting the atomic
  reservation, the controller runs `isSlotAvailable` (added to
  `availabilityEngine.ts` in Stage 9) as a server-side RECHECK — "нельзя
  доверять списку слотов, который ранее получил frontend"
  (technical-spec.md §8). That check is a fast, friendly-error fast path;
  it does **not** by itself prevent a race between two concurrent
  requests (classic check-then-act). The SlotLock reservation is what
  actually prevents it. Don't confuse the two or assume the recheck alone
  is sufficient.
- **The race-condition tests dev-tasks.md §10 explicitly asks for** ("2–20
  concurrent booking requests on one slot") are in
  `tenant/services/__tests__/bookingService.test.ts`, run against the
  same in-memory `SlotLock` fake used for all other DI-based service
  tests — the fake enforces the identical uniqueness constraint a real
  unique index would, so these tests genuinely exercise the
  conflict-handling branch of the algorithm, not just happy-path
  plumbing. **5-way and 20-way concurrent identical-slot requests both
  resolve to exactly one winner**, confirmed. What can't be verified in
  this sandbox (no MongoDB) is that MongoDB's own unique-index
  enforcement holds under _real_ concurrent writes — that's a
  well-established DB primitive, not something re-verified here; true
  concurrent-load testing against a live database is a job for the
  `mongodb` service container in CI or a staging environment.
- **Booking state machine**: `pending -> confirmed | cancelled`,
  `confirmed -> completed | cancelled | no_show`. All other transitions
  rejected. Transitions are themselves atomic
  (`status: { $in: [...expected] }` in the update filter) — two
  concurrent status-change requests for the same booking can't both
  apply; also unit tested. Cancelling or no-showing a booking releases
  its `SlotLock` cells, freeing that time back up; completing one does
  not (the time stayed reserved, it just moved to a terminal state).
- **Scope decisions, stated explicitly**: this delivers the
  **tenant-authenticated** staff booking flow only. The **public,
  unauthenticated** customer-facing booking endpoint
  (`POST /public/:slug/booking`) with OTP phone verification is
  deliberately deferred — it needs the OTP model/flow (dev-tasks.md §15,
  its own stage) and a different CORS/rate-limit posture. `Customer` is a
  new, intentionally minimal model (find-or-create by phone within a
  company) — full CRM (search, tags, priority/VIP, notes, booking
  history) is dev-tasks.md §12, a later stage. Reschedule and
  customer/internal note editing after creation are dev-tasks.md §11
  ("Booking management"), not this stage. No `locationId` field on
  `Booking` — same single-location MVP scope decision made for
  Employee/Service.

### Booking Management (Stage 11)

- `POST /api/tenant/bookings/:id/reschedule` — owner/admin/manager only
  (same authority level as status transitions). `PATCH /api/tenant/bookings/:id`
  — customer/internal note edits, open to any authenticated role (same as
  create). `GET /api/tenant/bookings` (with `employeeId`/`customerId`/
  `status`/`from`/`to` filters, already built in Stage 10) is the backend
  for calendar day/week/month views — no separate "calendar" endpoint was
  needed; a calendar UI just calls it with the relevant date range.
- **Reschedule reuses the exact same atomic-reservation mechanism as
  creation** (Stage 10) — it does NOT get a weaker guarantee just because
  it's "only" moving an existing booking. The naive approach (release the
  old slot, then try to reserve the new one) has a real bug: if the new
  reservation fails, the booking is left with **no lock at all**, silently
  losing its protection. `bookingService.rescheduleBooking` avoids this by
  computing the exact **cell delta** between the old and new footprints
  (`tenant/services/slotLocking.ts`) — it reserves only the NEWLY needed
  cells first (same reserve-before-mutate ordering as creation), and only
  releases cells no longer needed, via a new `SlotLockRepositoryPort.releaseCells`
  (distinct from `release`, which frees an entire booking's lock and would
  wrongly wipe the just-reserved new cells if reused here). If the new
  reservation fails, the original booking and its original lock are left
  completely untouched — verified directly in
  `tenant/services/__tests__/bookingService.test.ts`, including a
  concurrent-reschedule race test (two different bookings both trying to
  reschedule into the same new time — exactly one wins).
- Same server-side availability RECHECK as creation
  (`recheckAvailability` in `bookingController.ts`, shared by both
  handlers), with one addition: it excludes the booking's own current
  occupied time from the "conflict" check — otherwise a booking would
  always appear to conflict with itself when checking room at its new
  time.
- Only non-terminal bookings (`pending`/`confirmed`) can be rescheduled —
  attempting to reschedule a `completed`/`cancelled`/`no_show` booking is
  a `409 CONFLICT`, mirroring the status state machine's terminal-state
  handling.
- **Scope decision**: reschedule changes the TIME only, keeping the same
  employee and service. Reassigning a booking to a different staff member
  isn't supported here — cancel and create a new booking covers that case
  for now; revisit if a dedicated "reassign" flow turns out to be needed.

### Customer CRM (Stage 12)

- `POST/GET/PATCH /api/tenant/customers`, `DELETE /api/tenant/customers/:id`
  (anonymize), `GET /api/tenant/customers/:id/bookings` (booking history —
  just `bookingRepository.listInCompany` filtered by `customerId`, no
  separate data path).
- **RBAC is intentionally tighter for anonymization than the pattern used
  elsewhere**: read/create/update are owner/admin/manager (matching
  Employees/Services/BlockedTime), but `DELETE` (anonymize) is
  **owner/admin only** — a harder-to-undo operation than ordinary CRUD, so
  `manager` is deliberately excluded here.
- **Regex injection / ReDoS defense** (dev-tasks.md §12, explicitly called
  out as a required check): customer search (name/phone/email substring
  match) goes through `shared/validation/regexEscape.ts`
  (`escapeRegExp`) before ever reaching a MongoDB `$regex` filter — this
  is the ONLY place a search regex may be built from user input.
  `escapeRegExp` is unit-tested directly against both a regex-injection
  payload (`.*`, which would otherwise match everything) and a classic
  catastrophic-backtracking ReDoS payload (`(a+)+$` against a 50-character
  non-matching string resolves in under 50ms once escaped — an
  unescaped version of that pattern would hang). Search length is
  additionally bounded at the Zod layer as defense in depth, though the
  escaping alone is what makes arbitrarily long search input safe.
- **Delete = anonymize, not hard delete.** `Booking.customerId` references
  `Customer` documents (technical-spec.md §3), so hard-deleting would
  either orphan booking history or require a cascading delete the
  business likely doesn't want (they may need booking records for their
  own accounting/records even after a customer asks to be forgotten).
  `customerRepository.anonymizeInCompany` clears name/email/notes/tags and
  replaces phone with a synthetic placeholder (still passing the phone
  format validator, astronomically unlikely to collide — and if it ever
  did, the unique index would reject it loudly rather than corrupt data
  silently). **Known limitation, stated explicitly**: this does NOT
  cascade into historical `Booking.customerNote` fields, which could
  independently contain customer-entered PII — a fuller GDPR-style
  erasure flow is future work if that turns out to matter.
- `priority` (0-100) is the only "VIP-ness" signal — there's deliberately
  no separate `tier`/`level` enum. project-overview.md §9's informal
  "New/Regular/VIP" labels map naturally onto the free-form `tags` array
  instead, which is more flexible than a fixed enum would be (the source
  doc itself says "при необходимости другие внутренние статусы").
- `customerRepository.recordBooking` keeps `totalBookings`/`lastBookingAt`
  current as a denormalized counter, called automatically from
  `bookingService.createBooking` after every successful booking — no
  separate aggregation query needed on customer profile reads. Existing
  booking-service tests (34 of them) needed no changes to keep passing,
  confirming this didn't disturb the reserve-before-create/concurrency
  logic from Stage 10.

### File Storage + Portfolio + Temporary Booking Photos (Stage 13-14)

The first stage requiring genuinely new infrastructure — object storage.
**Important, stated up front**: the S3 adapter (`shared/storage/s3Storage.ts`)
is written and typechecked but **not runtime-verified in this sandbox** —
there's no network path to any S3-compatible endpoint here, the same gap
documented for MongoDB throughout this project. It needs a real
AWS S3/MinIO endpoint to exercise end-to-end; the `mongodb` CI service
container pattern is the model for how that verification should eventually
happen (a `minio` service, see below).

- **Storage is a DI port** (`shared/storage/storagePort.ts`), exactly like
  `bookingRepo`/`slotLockRepo` were for Stage 10 — because that's what
  makes upload/delete/cleanup ORCHESTRATION logic genuinely unit-testable
  without a live backend. An in-memory fake
  (`shared/storage/__tests__/inMemoryStorage.ts`) stands in for tests; the
  real adapter (`s3Storage.ts`, AWS SDK v3) works against AWS S3 directly
  or any S3-compatible service (MinIO, DigitalOcean Spaces, Cloudflare R2)
  via `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`.
- `docker-compose.yml` now includes a `minio` service for local dev parity
  with real S3 semantics, matching `.env.example`'s defaults. **You must
  create the bucket** (`S3_BUCKET`, default `beautybook-dev`) once via the
  MinIO console (`http://localhost:9001`, default creds
  `minioadmin`/`minioadmin`) or the `mc` CLI — docker-compose doesn't do
  this automatically.
- **Magic-byte validation is the authoritative format check**
  (`shared/storage/fileValidation.ts`) — never the client's Content-Type or
  filename extension, which can always be spoofed
  (security-measures.md §10). Allowlist is JPEG/PNG/WEBP only, matching
  technical-spec.md §10. 13 tests, including a "fake extension" case (HTML
  content correctly rejected regardless of what it might be labeled) and a
  WEBP-lookalike RIFF header that's correctly rejected as not-WEBP.
  **Known limitation, stated explicitly**: this checks the file's magic
  bytes/signature only, not full image decode integrity or deep
  polyglot/steganography sanitization — that would need real
  re-encoding (e.g. via `sharp`), deliberately out of scope for this
  stage. Mitigated instead by: randomized storage keys (no user filename
  ever trusted — `shared/storage/storageKey.ts`, 5 tests), explicit
  Content-Type set from the SNIFFED type on every response (never
  client-supplied), and never executing uploaded content.
- **Portfolio** (`PortfolioImage` — public, permanent):
  `POST/GET /api/tenant/portfolio`, `PATCH /api/tenant/portfolio/reorder`,
  `DELETE /api/tenant/portfolio/:id` — owner/admin/manager for mutations,
  any role for read (matches the Employees/Services pattern). `portfolioService`
  — 10 tests, including: delete removes the storage object BEFORE the DB
  record (so a still-referenced object never gets silently orphaned) and
  never touches storage for a cross-tenant delete attempt; reorder
  requires the submitted id list to be an EXACT match (no more, no fewer)
  of the company's own images, rejecting both partial lists and any
  foreign-company id.
- **Temporary booking photos** (`BookingAttachment` — private, expiring):
  `POST/GET /api/tenant/bookings/:bookingId/attachments`,
  `GET/DELETE .../attachments/:attachmentId`. **There is no public URL for
  these, ever** — `GET .../attachments/:attachmentId` is the ONLY way to
  read the bytes, and it re-runs the same tenant-auth + company-membership
  check as every other endpoint before streaming content back
  (security-measures.md §11). The JSON responses for upload/list
  deliberately omit `storageKey` (internal detail, never needed by a
  client). `bookingAttachmentService` — 14 tests.
- **The retry-safe cleanup job is the most safety-critical piece of this
  stage** (dev-tasks.md §14 explicitly requires "failed cleanup retried"
  as a checked behavior, not just an aspiration): `cleanupExpiredAttachments`
  deletes the storage object FIRST, and only marks the DB record deleted
  (atomically, via `markDeletedIfActive`) if that succeeds — a storage
  failure leaves the record `active` for the next run to retry, and one
  failing item never aborts the rest of the batch. This exact behavior is
  directly tested: a simulated storage outage on one item is verified to
  (a) leave that record `active`, (b) not prevent the other item in the
  same batch from being cleaned up, and (c) succeed on a second run once
  storage is healthy again.
- **Not wired into a scheduler yet.** BullMQ/Redis lands in
  dev-tasks.md §16/§17, a later stage. Until then, the cleanup job is a
  manually/cron-runnable CLI script
  (`npm run cleanup:attachments --workspace=apps/backend`), matching the
  same pattern as `seed:admin` (`admin/scripts/createAdminUser.ts`).
- **Scope decisions, stated explicitly**: no malware/AV scanning (would
  need a third-party service — technical-spec.md §10 lists this as
  "where applicable", treated as not applicable for this MVP stage). No
  image re-encoding/metadata stripping. The public-facing customer photo
  upload during the (not-yet-built) public booking flow will reuse
  `bookingAttachmentService` as-is once that stage exists — the service
  itself doesn't know or care whether the caller is staff or a public
  customer, only the controller/route layer differs.

### OTP + SMS + Background Jobs (Stage 15-17)

The second stage requiring genuinely new infrastructure — Redis/BullMQ.
**Same honest gap as every other external-service stage in this project**:
the BullMQ queue/worker glue (`shared/queue/*.ts`, `worker.ts`) is written
and typechecked, but **not runtime-verified** — there's no Redis reachable
in this sandbox. Two real bugs in that glue code were caught by typecheck
alone despite this (an ioredis default-import/NodeNext interop issue, and
BullMQ v6's `upsertJobScheduler` API replacing the older `add({repeat})`
pattern) — a useful reminder that typecheck catches real problems even
when the code can't be exercised at runtime, but it's not a substitute for
an actual integration run against live Redis before this ships.

- **OTP** (`Otp` model, `otpService`) — dev-tasks.md §15's full checklist,
  all directly tested: wrong code, expired code, reused code (single-use),
  brute-force lockout, resend cooldown, concurrent verification (a race
  where several requests submit the correct code simultaneously — exactly
  one succeeds). The atomic core is a single Mongo `$expr` update
  (`otpRepository.claimAttempt`) that combines "not expired", "not already
  verified", and "still under max attempts" into ONE conditional
  increment — this is what makes brute-force lockout and concurrent
  verification both correct under a race without needing a transaction,
  same design principle as `SlotLock`/`Booking` status transitions.
  **Currently unwired to any HTTP endpoint** — OTP's only real consumer is
  the public booking flow's phone verification step, which doesn't exist
  yet. The service is complete and tested; only the controller/routes are
  deferred, exactly like Customer/Booking were built ahead of their public
  API in earlier stages.
- **SMS provider abstraction** (`SmsProviderPort`) — `console` (default,
  logs to stdout, only in `development` — see below) or `twilio` (real
  adapter, **not runtime-verified**, no network path to Twilio here
  either). Switch via `SMS_PROVIDER` in `.env`.
- **Notification** (`Notification` model, `notificationService`) — the
  durable job record AND the idempotency mechanism dev-tasks.md §16
  explicitly requires: a unique `dedupeKey` index means enqueuing the same
  logical notification twice (duplicate job) returns the SAME record, and
  `claimForSending` is an atomic conditional status transition
  (`pending`/`failed` + under `maxAttempts` → `sending`) that makes a
  duplicate/concurrent SEND attempt or a duplicate provider callback safe
  too — only one actual SMS ever goes out, verified directly with a
  3-way concurrent send test. A failed send is retryable (up to
  `maxAttempts`) without ever double-sending on retry.
- **Reminders** (`computeReminderTimes`, `ReminderSchedulerPort`) —
  dev-tasks.md §17's checklist: exactly one reminder per booking (BullMQ
  deterministic job ids `reminder-24h:<bookingId>`/`reminder-2h:<bookingId>`
  double as the dedup mechanism at the scheduling layer, on top of
  `Notification.dedupeKey` at the send layer), no reminder after
  cancellation (`bookingService.updateStatus` cancels pending reminder
  jobs on `cancelled`/`no_show`), reminder follows a rescheduled booking
  (cancel-old + schedule-new on `rescheduleBooking`). **DST/timezone
  correctness is trivial by construction, not by careful handling**: "24
  hours before" is pure millisecond arithmetic on an already-UTC instant,
  so there's no wall-clock reinterpretation to get wrong in the first
  place — directly proven with tests spanning both the spring-forward and
  fall-back Oslo transitions. (Contrast with the availability engine's
  slot generation, which genuinely needs DST-aware wall-clock-to-UTC
  conversion because it works with company-local working hours — a
  different problem with a different, harder solution.)
- **`reminderScheduler` is an OPTIONAL dependency of `bookingService`** —
  added without touching any of the 34 pre-existing booking-service tests,
  and three explicit resilience tests prove a throwing/unavailable
  scheduler can never break booking creation, cancellation, or reschedule
  (errors are logged via `console.error`, never propagated — matches the
  same philosophy as the customer-stats and cleanup-job code elsewhere).
- **Confirmation/cancellation notifications are enqueued from the
  CONTROLLER, not from `bookingService`** — a deliberate, documented split
  from how reminders are wired: reminder SCHEDULING is purely mechanical
  (needs only `bookingId`/`startAt`, belongs with booking mechanics),
  whereas notification CONTENT needs business context (company name,
  service name, customer phone) that only the controller has already
  resolved for the availability recheck. Booking confirmation (on create)
  and cancellation (on cancel) are wired as the concrete worked examples;
  reschedule and owner-notification messages follow the identical
  `enqueueBookingNotification` pattern and are straightforward,
  intentionally deferred extensions rather than architectural gaps.
- **The Stage 13-14 cleanup job is finally wired into BullMQ**
  (`registerCleanupRepeatableJob`, using BullMQ v6's `upsertJobScheduler`
  — idempotent to call on every server start) — closing that loop. The
  standalone CLI script (`npm run cleanup:attachments`) still works
  independently, useful for environments without the worker process set
  up yet, or for an ad-hoc manual run.
- **Workers run as a separate process** (`npm run worker` /
  `npm run worker:dev`), not inside the HTTP server — `src/worker.ts`
  mirrors `src/server.ts`'s connect/graceful-shutdown structure. This
  matches how BullMQ workers are meant to be deployed (independently
  scalable from the API, restartable without dropping HTTP traffic).

## Requirements

- Node.js >= 22 (see `.nvmrc`)
- npm >= 10

## Getting started

```bash
nvm use               # optional, matches .nvmrc
npm install            # installs all workspaces
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/admin/.env.example apps/admin/.env.local
# fill in real values in the copied .env files — never commit them

docker compose up -d   # starts local MongoDB + Redis + MinIO
```

Create the first platform admin account (no public registration endpoint exists for this — see Authentication below):

```bash
npm run seed:admin --workspace=apps/backend -- \
  --email you@company.com --name "Your Name" --password "a-strong-password"
```

Run the backend:

```bash
npm run dev:backend    # http://localhost:4000/health
```

Run the public frontend:

```bash
npm run dev:frontend   # http://localhost:3000
```

Run the platform admin app:

```bash
npm run dev:admin      # http://localhost:3100
```

## Scripts (root)

| Script                 | Description                                 |
| ---------------------- | ------------------------------------------- |
| `npm run typecheck`    | `tsc --noEmit` across all workspaces        |
| `npm run lint`         | ESLint across the whole repo                |
| `npm run lint:fix`     | ESLint with autofix                         |
| `npm run format`       | Prettier write                              |
| `npm run format:check` | Prettier check (used in CI)                 |
| `npm test`             | Vitest across all workspaces                |
| `npm run build`        | Production build for all workspaces         |
| `npm run audit`        | `npm audit` (report-only in CI, see `docs`) |

## Environment configuration

- Local: copy `.env.example` → `.env` (backend) / `.env.local` (frontend,
  admin).
- Staging/production: environment variables are injected by the deployment
  platform's secret manager. No `.env.staging` / `.env.production` files are
  ever committed — only `.env.example` files are tracked in Git.
- Backend environment variables are parsed and validated with Zod at startup
  (`apps/backend/src/config/env.ts`); the process fails fast with a clear
  error if required variables are missing or malformed.
- Tenant JWT secrets, platform-admin JWT secrets, and their respective CORS
  allowlists are **required to be different** — enforced at startup when
  `NODE_ENV=production`.

## CI

`.github/workflows/ci.yml` runs on every push/PR:

1. **secret-scan** — Gitleaks over the full git history.
2. **typecheck** — fails the build on any TypeScript error.
3. **lint** — ESLint + Prettier check, fails on any lint error (including the
   tenant/admin import boundary rule above).
4. **test** — Vitest for all three workspaces. A MongoDB service container
   is available to the backend test job for future DB-backed integration
   tests; the current suite runs entirely against in-memory fakes and
   Mongoose `validateSync()` and doesn't require it.
5. **build** — production build, runs only after typecheck/lint/test pass.
6. **dependency-audit** — `npm audit`, report-only (non-blocking); CVEs are
   triaged manually for real exploitability rather than blocking releases on
   every advisory (see `beautybook-security-measures.md` §25 and
   `docs/dependency-audit-notes.md` for the current triage table).

## Security baseline

See `beautybook-security-measures.md` for the full security baseline this
project follows (multi-tenant isolation, auth, RBAC, file upload safety,
booking concurrency, Stripe webhook verification, logging redaction, etc.).
It is enforced incrementally as each stage of `beautybook-development-tasks.md`
is implemented — this infra stage does not itself constitute a secure,
feature-complete application.

## Contributing / workflow

Follow `beautybook-development-tasks.md` in order: a stage is not considered
done until it is implemented, validated (lint/typecheck/tests), reviewed for
authorization and tenant isolation, and CI is green.
