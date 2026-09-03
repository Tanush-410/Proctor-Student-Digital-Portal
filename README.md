# Online Proctor Diary & Student Academic Management System

Implementation of the "Online Proctor Diary & Student Academic Management System — Design Document"
(B.M.S. College of Engineering, Dept. of CSE) — a three-tier app with
role-aware Admin / Proctor / Student portals, an append-only results ledger with a
precedence-resolution engine, a spreadsheet ingestion & proctor-allocation pipeline, and an
activity-points claim/review lifecycle.

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma ORM + Postgres (hosted on Supabase). OTP
  auth over an httpOnly session cookie — sent by real e-mail when SMTP is configured, and in
  local dev only (never in production) also echoed in the API response so you don't need a mail
  server to test with.
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + React Router.

All API routes live under `/api/*` on the backend. In dev, the Vite server proxies `/api/*`
straight through to the backend (no rewriting) so the browser only ever talks to one origin. In
production, the backend serves the built frontend itself from the same process — see "Deployment"
below. See "Security" below for the details behind all of the above.

## Project layout

```
backend/
  prisma/schema.prisma    — the ER model from Section 5, plus Session/OTP/ImportException
  prisma/seed.ts          — sample Admin/Proctor/Student accounts and academic data
  src/app.ts              — Express app: /api routes only, no listen() (imported by both index.ts and tests)
  src/index.ts            — production static-file serving, session/OTP cleanup, app.listen()
  src/modules/            — one folder per service from Section 3 (auth, ingestion, results,
                             activityPoints, calendar, faculty, students, reports)
  src/middleware/session.ts — Auth & RBAC gateway (Section 9): identity always comes from the
                             session token, never a client-supplied id
  src/lib/asyncSafeRouter.ts — every route is async; this ensures a thrown/rejected error reaches
                             the error handler instead of hanging the request or crashing the process
  src/lib/rateLimiter.ts  — per-e-mail OTP throttling
  src/modules/**/*.test.ts, src/__tests__/api.test.ts — vitest unit + supertest integration tests
frontend/
  src/portals/{admin,proctor,student}/ — one page per tab in the Section 11 site map
  src/portals/shared/      — Directory and StudentDetail, used by both Admin and Proctor
  src/auth/                — OTP login flow + session context
  src/components/ErrorBoundary.tsx — catches render errors instead of blanking the page
```

## Running it locally

Create a free [Supabase](https://supabase.com) project, then copy `backend/.env.example` to
`backend/.env` and fill in `DATABASE_URL` (pooled, :6543) and `DIRECT_URL` (direct, :5432) from
its Project Settings -> Database -> Connection string page.

From the repo root:

```bash
npm run setup   # installs both workspaces, runs the Prisma migration, seeds sample data
npm run dev     # runs backend (:4000) and frontend (:5173) together
```

Or manually, in two terminals:

```bash
# 1. Backend — http://localhost:4000
cd backend
npm install
npx prisma migrate dev   # first run only; creates dev.db
npm run seed             # loads sample Admin/Proctor/Student accounts
npm run dev

# 2. Frontend — http://localhost:5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Log in with any seeded e-mail below; the OTP screen shows the
code directly (dev mode has no mail service configured).

| Role    | E-mail                        |
|---------|--------------------------------|
| Admin   | hod.cse@bmsce.ac.in            |
| Proctor | anjali.rao@bmsce.ac.in         |
| Proctor | sunil.kumar@bmsce.ac.in        |
| Student | aarav.sharma@bmsce.ac.in       |
| Student | diya.nair@bmsce.ac.in          |
| Student | kabir.patel@bmsce.ac.in        |
| Student | meera.krishnan@bmsce.ac.in     |

`diya.nair@bmsce.ac.in` is seeded to demonstrate the precedence engine end-to-end: a
provisional self-entry that disagrees with the eventual official result (discrepancy flag), and
a subject that failed on `MAIN` and was cleared via `SUPPLEMENTARY`.

As Admin, use the **Faculty** tab to onboard new proctors — there's no other way to add one
short of editing `prisma/seed.ts`.

### Seeding at scale (100 faculty, 3000 students)

`prisma/seed.ts` above is a small hand-authored demo (7 accounts) — good for a quick look.
`prisma/seedScale.ts` generates a much larger, realistic dataset instead: 100 faculty (5 Admin,
95 Proctor), 3000 students across four admission cohorts (2022–2025), each with a full result
history for **every** semester from admission through their current one — not just their latest
— roughly 80,000 result records total, plus ~1,400 activity-point claims and ~190 PTM records.
Deterministic (seeded RNG), so re-running it reproduces the same dataset. Generates and inserts
everything in about 2 seconds (bulk `createMany`, not one row at a time).

```bash
cd backend
npm run seed:scale
```

The same four "known" student/proctor/admin e-mails from the table above are preserved inside
this larger dataset (so links and credentials you've already shared keep working), each with a
guaranteed — not random — pattern to point a demo at:

| Account | What to look at |
|---|---|
| `aarav.sharma@bmsce.ac.in` | Clean pass record across all 7 semesters |
| `diya.nair@bmsce.ac.in` | Semester 5: a discrepancy flag (self-entry vs. official) + a semester-5 backlog cleared via `SUPPLEMENTARY` |
| `kabir.patel@bmsce.ac.in` | Semester 5: a `MAIN` fail overturned by `REVAL` |
| `meera.krishnan@bmsce.ac.in` | Shorter history — only through semester 5 |
| `anjali.rao@bmsce.ac.in` | Proctor for ~34 students, including the three above |

Verified against the running app after generating it, back when this ran on SQLite (not just
the seed script's own output): `GET /students/count` and `GET /proctors/count` both resolved
in single-digit milliseconds, a directory search over 3000 students returned in under 10ms, and
a PDF report for a 7-semester student generated in ~30ms — see "Design decisions" below for the
pagination/count-endpoint changes that made the first of those true. **Not yet re-measured
against Supabase** — a remote Postgres connection adds real network round-trip latency that a
local SQLite file never had, so re-run this check once you're pointed at your Supabase project
rather than assuming the same numbers hold.

## Tests

```bash
cd backend
npm test
```

Runs against a dedicated Postgres database (`TEST_DATABASE_URL` in `backend/.env`, wiped and
recreated on every run via `prisma db push --force-reset` — never the dev database, see
`backend/.env.example`), covering:
- The results-precedence engine and the ingestion pipeline in isolation (`vitest` unit tests).
- Auth, RBAC, the results/activity-points/ingestion HTTP flows, and OTP rate limiting end-to-end
  against the real Express app (`supertest` integration tests).

This suite is what caught two real bugs while being written, both now fixed and covered by a
regression test:
- **Results upload was completely broken.** The generic sheet parser required an `email` column
  on every row for every upload type, but the results-sheet template never has one — so every
  results-upload row was silently rejected as a parse error, for every proctor, always. Fixed by
  moving the e-mail requirement to the two upload flows that actually need it (class-list,
  admission-data) instead of enforcing it in the shared parser.
- **A faculty account created with a mixed-case e-mail could never log in.** OTP login lowercases
  the e-mail before its lookup (intentionally, for case-insensitive login), but `POST /faculty`
  stored whatever case an Admin typed. Fixed by normalising e-mail to lower-case at the point of
  creation/update.

## Deployment

### Docker (recommended)

```bash
docker compose up -d --build
```

This is **two** containers, not one: `app` (the Node/Express API + built frontend, not reachable
directly from the host) and `caddy` (reverse proxy + automatic TLS, published on `:80`/`:443`).
That's not optional scaffolding — the app issues its session cookie with `Secure` set in
production (Section "Security" below), which means a browser will silently refuse to store it at
all if the app were reached over plain HTTP. Caddy is what makes login work, not just what makes
it safer. `docker compose up` alone gets you a working HTTPS login at **https://localhost** —
Caddy self-signs a locally-trusted certificate for `localhost` with no setup. For a real
deployment, edit `Caddyfile` and replace `localhost` with your actual domain; Caddy then obtains
and renews a real Let's Encrypt certificate automatically.

The database lives in Supabase, not in this container — `DATABASE_URL`/`DIRECT_URL` in a `.env`
file at the repo root (see `.env.example`; docker compose loads it automatically) point the app
at your Supabase project. Only uploaded proof files live in the container's own named volume
(`proctor-diary-uploads`, mounted at `/data`), surviving container restarts/redeploys. On every
start, the container runs `prisma migrate deploy` against Supabase before the server starts, so
schema upgrades on redeploy are automatic and safe.

**A fresh deployment has zero user accounts** — OTP login only works for an e-mail that already
has a Faculty/Student row, so there's no way to log in until one exists. Bootstrap the first
Admin once, right after the first `up`:

```bash
docker compose exec \
  -e BOOTSTRAP_ADMIN_EMAIL=hod@yourcollege.edu \
  -e BOOTSTRAP_ADMIN_NAME="Dr. Your HOD" \
  -e BOOTSTRAP_ADMIN_SHORT_CODE=HOD \
  app npm run bootstrap-admin
```

Idempotent — re-running it is a no-op if that e-mail is already an Admin. From there, log in as
that Admin and use the **Faculty** tab to onboard everyone else. Without `SMTP_*` env vars set
(below), the OTP code goes only to the container's own logs (`docker compose logs app`) — nowhere
a caller can read it from, which is the point (see Security). Set `SMTP_*` for real deployments
so people actually receive their code by e-mail instead of you reading it out of the logs for them.

This whole flow — fresh boot, migration, bootstrap, login over real HTTPS with a browser-grade
Secure+httpOnly cookie, faculty/student onboarding, a spreadsheet upload, an activity-point claim
with a file upload, the IDOR/file-type protections on that upload, a container restart, and a
graceful `SIGTERM` shutdown — was run end-to-end against the actual built image (Caddy included)
while building this, not just written and assumed to work.

**Environment variables** (see `docker-compose.yml`):

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port the server listens on | `4000` |
| `DATABASE_URL` | Supabase Postgres, pooled connection (pgbouncer, `:6543`) — what the app queries at runtime | none — required |
| `DIRECT_URL` | Supabase Postgres, direct connection (`:5432`) — used only by `prisma migrate deploy`/`dev` | none — required |
| `UPLOADS_DIR` | Where proof-file uploads are written — point this into the volume, e.g. `/data/uploads` | `backend/uploads` |
| `CORS_ORIGIN` | Only relevant if the frontend is ever hosted separately from the API | `http://localhost:5173` |
| `NODE_ENV` | `production` turns on serving the built frontend, HTTPS enforcement, and Secure cookies | — |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Real OTP e-mail delivery (`lib/mailer.ts`) — without these, OTPs only ever reach the server's own logs | unset |

**What this doesn't include, deliberately:**
- **Database backups.** Supabase takes daily backups automatically on its paid plans (the free
  tier does not include them) — check your project's plan and set up point-in-time recovery if
  you need it. This is now Supabase's responsibility, not this app's.
- **Uploaded proof files.** Still local disk, in the `proctor-diary-uploads` volume — back that
  up on whatever schedule matters to you (`docker run --rm -v proctor-diary-uploads:/data -v
  $(pwd):/backup alpine tar czf /backup/backup.tgz /data`).
- **Horizontal scaling of the app itself.** Postgres removes the SQLite single-writer ceiling,
  but this is still a single-container deployment: OTP/rate limiting (`lib/rateLimiter.ts`) is
  in-memory per process, so it wouldn't coordinate correctly across multiple app instances
  without moving that state somewhere shared (e.g. Redis) first.

### Without Docker

```bash
npm run build   # builds frontend/dist, then compiles the backend
NODE_ENV=production DATABASE_URL="<supabase pooled url>" DIRECT_URL="<supabase direct url>" npm start
```

`npm start` runs `node backend/dist/index.js`, which serves the API and the built frontend from
one process/origin. Run `npx prisma migrate deploy` (from `backend/`) before starting it, and
`npm run bootstrap-admin` (from `backend/`, with the same env vars as above) once, the same as
the Docker path.

**You still need a TLS-terminating reverse proxy in front of this** — with `NODE_ENV=production`
the app redirects plain HTTP to HTTPS and sets its session cookie as `Secure`, so login won't work
at all without one (see Security). Point it at whatever port `PORT` is set to; `docker-compose.yml`
+ `Caddyfile` in this repo work as a reference even if you're not using Docker for the app itself.

## Security

Nothing here is a "no one can ever hack this" claim — nothing ships with that. What follows is
what's actually in place, what's still on you, and two real vulnerabilities this pass found and
fixed while building it (not assumed away).

**Two things that were wrong and are now fixed, worth knowing about specifically:**
- **The OTP endpoint used to leak the login code to anyone who asked for it.** The dev-mode
  convenience (echo the code in the API response so you can test without a mail server) had no
  environment gate — it always returned the code, meaning anyone who knew a valid e-mail address
  could log in as that person, no mailbox access required. Now gated to `NODE_ENV !== "production"`
  in both the response body and the server log; real e-mail delivery (`SMTP_*` env vars, see
  above) is the only way OTPs reach anyone in production. Regression-tested in
  `src/__tests__/api.test.ts` ("never leaks the OTP code...") and re-verified live against an
  actual production-mode container (see the Docker section above).
- **Activity-point proof uploads accepted any file type and served it back with its original
  extension and content type.** A `.html` proof file with an embedded `<script>` would execute in
  the app's own origin for anyone who opened it — at the time, a proctor clicking "view proof" on
  a malicious claim, with access to whatever `localStorage` held (which, at the time, was the
  session token itself). Closed from two directions: uploads are now restricted to a JPEG/PNG/
  WEBP/GIF/PDF whitelist enforced server-side (not by trusting the filename), and files are always
  served with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, so nothing
  fetched from `/api/uploads/*` can ever render as a page in this app's origin regardless of what
  slips past the whitelist.

**Sessions are an httpOnly cookie, not a token in `localStorage`.** This was a deliberate
migration partway through building this, specifically because of the bug above: a Bearer token
sitting in `localStorage` is readable by any script running on the page, so any future XSS bug —
not just the file-upload one already found — would hand over a live session. An httpOnly cookie
can't be read by JavaScript at all, closing that entire class of theft regardless of where a future
XSS bug turns up. `sameSite: "lax"` is what provides CSRF protection here (the standard, no-extra-
token approach for an API-plus-SPA app): the cookie rides along on top-level GET navigations but is
withheld from cross-site POST/PATCH/fetch. In production the cookie is also `Secure` (HTTPS-only)
— see the Deployment section for why that means a reverse proxy with TLS isn't optional.

**Per-file authorization on uploads, not just "any logged-in user can fetch any file."** Proof
files used to be served by a bare `express.static` mount — reachable by anyone who had (or
guessed) the URL, authenticated or not. They're now served through a route that re-checks the same
access matrix (Section 9) as the claim itself: the submitting student, that claim's proctor, or an
Admin — an unrelated student or proctor gets a 403 even though they're a perfectly valid
authenticated user. Regression-tested in the "Proof file access control (IDOR regression coverage)"
describe block.

**Rate limiting, two layers.** Per-e-mail (`lib/rateLimiter.ts`: 5 OTP requests / 8 verify attempts
per 10 minutes) stops brute-forcing one account's 6-digit code or spamming one mailbox. Per-IP
(`express-rate-limit`, 200 auth requests / 2000 general requests per 15 minutes) stops an attacker
who rotates through many different e-mail addresses from one machine, which the per-e-mail limiter
alone wouldn't catch.

**A Content-Security-Policy that's actually strict, not disabled.** `script-src 'self'`,
`style-src 'self'` — no `'unsafe-inline'` on either, which is what actually stops an injected
script or style from executing rather than just making CSP present-but-toothless. That was only
possible because the built frontend has zero inline `<script>`, zero CDN dependencies (fonts are
self-hosted via `@fontsource`, not Google Fonts), and — after moving the one inline `style={{}}`
prop the app had into a Tailwind utility class — zero inline styles either, confirmed by grepping
the actual built `dist/` output rather than assumed.

**RBAC enforced server-side on every request**, deriving "whose data" strictly from the session,
never from a client-supplied id in a URL or body — the design doc's own stated goal (Section 9),
and the thing the original test suite was built around proving.

**What's still on you:**
- **A real SMTP provider.** Without `SMTP_*` configured, production logins only work for whoever
  can read the container's logs — correct and safe, but not usable by real end users. Point it at
  whatever your college/org already uses (Office 365, Google Workspace, SendGrid, etc.).
- **Keeping dependencies patched.** `npm audit` was run and cleared for both `backend/` and
  `frontend/` while building this (including upgrading `vitest`, `vite`, and `react-router-dom`
  past known CVEs) — that's a snapshot, not a standing guarantee. Re-run it periodically.
- **The UI has still not been visually verified in a browser** — no browser automation tool was
  available while building this. Every security fix above was verified against the real running
  HTTP API (and, for the Docker path, through actual Caddy-terminated HTTPS with a real cookie
  jar) — not against what it looks like or behaves like when clicked through by a human.
- **Physical/infrastructure security** (who has SSH access to the app host, who has access to
  the Supabase project/dashboard, how the uploads volume is protected at rest, etc.) — outside
  what an application-layer pass can address.

## Design decisions worth knowing about

- **Enum-like fields are plain strings, not native Postgres enums** — fields modelled as enums
  in Section 5 (`source_type`, `status`, claim `status`, faculty `role`) are plain strings in
  the schema, validated in the TypeScript layer instead (`src/modules/**`). Postgres does
  support native enums (SQLite, the original datastore here, didn't) — kept as strings anyway
  so the Supabase migration was a pure database swap, not also a schema redesign.
- **Exception queue is persisted**, not just returned once in the upload response (`ImportException`
  model) — this wasn't in the original ER diagram, but Section 4.2's "no student is silently
  lost" only holds if unmatched rows stay queryable after the upload response is gone.
- **Results precedence order**: `CHALLENGE_REVAL > REVAL > TAL > SUPPLEMENTARY > MAIN >
  STUDENT_PROVISIONAL`. The design document flags TAL's exact rank as an open question
  (Section 13); `SUPPLEMENTARY` and `STUDENT_PROVISIONAL` aren't ranked there at all — the
  assumption made here is documented in `backend/src/modules/results/engine.ts`.
- **Grading scale**: standard 10-point scale (O=10 … F=0), since the design document doesn't
  specify one.
- **Faculty management (`POST`/`PATCH /faculty`)** isn't in the design doc's use-case diagrams —
  faculty accounts were assumed pre-existing — but an Admin portal with no way to onboard a
  proctor can't actually be operated day to day, so it was added.
- **OTP and general rate limiting** — see the Security section below.
- **xlsx is installed from SheetJS's own CDN**, not the npm registry — the registry build is
  frozen with known prototype-pollution/ReDoS advisories that SheetJS only patches on their CDN.
  See `backend/package.json`.
- File uploads: spreadsheets accept `.csv`, `.xlsx`, `.xls`; activity-point proof accepts
  JPEG/PNG/WEBP/GIF/PDF only — see Security for why that's enforced server-side, not by filename.
- **Bootstrap-admin, not self-registration.** There's still no public sign-up — deliberately,
  since the design doc's whole access model assumes every account is provisioned by the college
  (Admin creates faculty, ingestion creates students), not self-service. `bootstrap-admin` exists
  solely to break the chicken-and-egg problem of the very first account on a fresh database.
- **The Docker build installs OpenSSL before `prisma generate`, in the build stage, not just the
  runtime stage.** Prisma picks its query-engine binary based on the OpenSSL version it detects
  at generate time; skip this and it silently defaults to the wrong engine, which then fails at
  container startup, not build time — the kind of failure that only shows up after you've already
  deployed. Both stages use the same Alpine base specifically so the engine picked at build time
  matches what's actually present at runtime.
- **Search is explicitly case-insensitive** (`mode: "insensitive"` on every `contains` filter in
  faculty search, student search, and directory search) — SQLite's `contains` was
  case-insensitive by default, Postgres's isn't; this was added when moving to Supabase so
  search behavior didn't silently change along with the database.
- **Counts, not full lists, for dashboard stat tiles.** `GET /students/count` and
  `GET /proctors/count` exist specifically because the Admin dashboard used to fetch the entire
  students/faculty table just to read `.length` — invisible at 7 students, a real cost at 3000.
  `GET /students`, `GET /activity-points/claims`, `GET /admin/import-exceptions`, and
  `GET /directory/search` all cap their unfiltered/broad-query response sizes for the same reason
  — a proctor's own ~30-student list never hits these caps, only Admin-wide/unscoped views do.

## Known gaps

- **The UI has not been visually verified in a browser** — no browser automation tool was
  available while building this. Everything, including every bug fix described above, was
  verified through the real HTTP API (and for Docker/Security, through actual Caddy-terminated
  HTTPS with a real cookie jar) and the frontend build/typecheck passes clean, but a manual
  click-through is worth doing before you rely on it.
- **Backups are on you** — see the Deployment section above for what to do about it.
- The app itself is still single-container (see "Horizontal scaling of the app itself" in
  Deployment above) — Postgres/Supabase removes the database-side ceiling SQLite had, but
  in-memory rate limiting means running multiple app instances isn't safe yet without moving
  that state somewhere shared first.
- PTM scheduling/slot assignment/parent notification, attendance ingestion, and AICTE
  activity-point category ceilings are explicitly out of scope per the design doc's Section 13 —
  not gaps, just flagged so they aren't mistaken for oversights.
