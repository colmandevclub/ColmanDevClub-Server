# CLAUDE.md — ColmanDevClub-Server

<!-- shared-core:start — identical in ColmanDevClub-New-Website and ColmanDevClub-Server. Change it in both repos, in paired PRs. -->

## Project

The ColmanDevClub website: public club site, admissions, and a Mentor/Admin dashboard for running each academic year (curriculum, study materials, absences, member progress). Hebrew only, fully RTL. Two repos:

| Repo                        | What                 | Stack                                                                                                                     |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ColmanDevClub-New-Website` | Web SPA              | Vite + React 19 + TS, React Router 7, Tailwind + shadcn/ui, TanStack Query + axios, react-hook-form + zod, Motion, Vitest |
| `ColmanDevClub-Server`      | REST API (`/api/v1`) | Express 5 + TS, MongoDB/Mongoose, zod, JWT in httpOnly cookies, Cloudinary, Gmail SMTP, Vitest + supertest                |

Both deploy to Vercel on one origin: the web project rewrites `/api/*` to the API. pnpm, Node 22. Scripts live in each `package.json`; that file is authoritative.

## Specs: the source of truth

The specs live in the web repo under `docs/specs/` (from the API repo, clone both side by side and read `../ColmanDevClub-New-Website/docs/specs/`):

- One folder per epic (`e0-foundations/` … `e8-quality-launch/`), each with `requirements.md` (**what** and why: `R-xx.y` EARS criteria), `design.md` (**how**: the epic's DESIGN sections and its §6.2 endpoints) and `tasks.md` (its stories `S-#.#`, traced to R/T IDs, with acceptance criteria).
- `core/` holds what every feature follows: `core/requirements.md` (decisions `Dxx`, roles and the permission table §3, R-12, UX R-33–R-38, non-functional R-41–R-44) and `core/design.md` (architecture, technical decisions `T-xx`, routes, API conventions, authorization, data model §8, email, security, testing, CI/CD, open items `O-x`).
- `README.md` says where every ID and § lives and holds the planning summary and traceability; `CHANGELOG.md` holds the history.

"REQUIREMENTS", "DESIGN" and "TASKS" below mean the matching files of the spec set; § numbers and IDs are the same as before the split. Read the story's R-IDs and the DESIGN sections the story names **before writing code**. When code and spec disagree, the spec wins. If the spec is wrong or silent, fix the spec in the same PR (see Workflow). How the method works, a full worked example, and templates: `docs/sdd/` in the web repo.

## Hard rules

1. **RTL with logical utilities.** Use `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/text-end`. Physical classes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`) fail CI. Wrap English terms inside Hebrew text in `<bdi>`; emails, URLs, phones and code get `dir="ltr"`.
2. **Permissions live in policies.** Every API route declares a policy from `src/policies/` (`isAdmin`, `isMentorOfYear`, `canManageMaterials`, …). The server decides; web route guards only shape the UX.
3. **The API's zod schemas are authoritative.** The web repo keeps a copy in `src/schemas/`. Change the API schema first, then mirror it in the same pair of PRs. Every route registers its schemas in the OpenAPI registry (`/api/docs`).
4. **One error format:** `{ "error": { "code", "message", "fields?" } }` with `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `RATE_LIMITED` 429. 403/404 never reveal whether someone else's resource exists.
5. **Secrets and PII stay out of the repo and the logs.** Secrets come from env vars (keys listed in `.env.example`). Logs carry request ids, user ids and status codes only, never emails, phones, tokens or notes.
6. **Members never see tracking data.** Absences, attendance, progress, notes and member status go only to that year's Mentors and to Admins, and never to members, including about themselves (R-32.2, R-44.3). Applicant phone and email go to Admins only (R-44.2). Enforce this in the serializer and test it.

## Workflow (SDD)

1. **Start from a Jira story** (project `KAN`). Its description holds the `S-#.#`, R-IDs and acceptance criteria from TASKS.
2. **Branch** `KAN-<n>-<short-slug>` from `main`, e.g. `KAN-42-new-since-last-visit`.
3. **Tests per acceptance criterion.** Every criterion gets a test whose name starts with its ID (`R-20.4 marks materials published after the last visit as new`), or an explicit "checked by hand" line in the PR.
4. **IDs are stable.** Reference R/D/T/S IDs exactly. A removed ID is retired and never reused; new ones take the next free number.
5. **Docs move with the code.** A change in scope, an endpoint, a model field or a decision updates the matching `requirements.md`/`design.md`/`tasks.md` of the owning epic, or `core/` (bump the version in `docs/specs/README.md` and add a row to `docs/specs/CHANGELOG.md`). The specs live in the web repo, so a web change updates them in the same PR, and an API change opens a paired web PR with the same Jira key and links the two.
6. **PR** title starts with the Jira key; fill `.github/pull_request_template.md`. CI green + one lead approval (CODEOWNERS); then the author merges.

<!-- shared-core:end -->

## This repo: API

**Folders** (DESIGN §3.2): `src/modules/<domain>/` with `*.routes.ts`, `*.controller.ts` (HTTP only), `*.service.ts` (business rules), `*.test.ts` · `src/middleware/` · `src/policies/` · `src/schemas/` (authoritative zod) · `src/models/` (Mongoose) · `src/services/{storage,email,google}` (interface + adapters) · `src/docs/` OpenAPI registry · `tests/integration/` · `api/index.ts` Vercel entry.

**Conventions**

- The middleware order is fixed (DESIGN §6.1): helmet → cookies → json → logging → `csrfGuard` → `rateLimit` → `authenticate` → `authorize(policy)` → `validate(schema)` → controller → `errorHandler`. A new route plugs into it in that order.
- Controllers translate HTTP and nothing more. Rules and permission-dependent shaping live in services and serializers. Drop role-restricted fields in the serializer (e.g. `ApplicationDTO` without contact details for mentors).
- Derived values (attendance rate, current week, "new since last visit") are computed on read, never stored (DESIGN §8).
- Every policy gets table-driven tests against the permission table in REQUIREMENTS §3. Every endpoint gets supertest integration tests on `mongodb-memory-server`, named by R-ID.
- External services go through their interface (`StorageService`, `EmailService`). Local dev uses the filesystem and console adapters.
- Definition of Done for every later API story: register each added/changed route's authoritative request/response schemas, errors, auth cookie, policy and R-IDs in `src/docs/` using `registerApiRoute` (T-23, T-12). `pnpm docs:check` must pass; CI rejects unregistered routes.
- Sample data for a new feature goes into the seed script (`pnpm seed`).
