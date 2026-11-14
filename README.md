# ColmanDevClub-Server

## Docs

- [CLAUDE.md](CLAUDE.md): project rules for people and AI agents
- Specs (in the web repo): [REQUIREMENTS](https://github.com/colmandevclub/ColmanDevClub-New-Website/blob/main/docs/specs/REQUIREMENTS.md) · [DESIGN](https://github.com/colmandevclub/ColmanDevClub-New-Website/blob/main/docs/specs/DESIGN.md) · [TASKS](https://github.com/colmandevclub/ColmanDevClub-New-Website/blob/main/docs/specs/TASKS.md)
- [How we work (SDD)](https://github.com/colmandevclub/ColmanDevClub-New-Website/blob/main/docs/sdd/README.md) · [Worked example](https://github.com/colmandevclub/ColmanDevClub-New-Website/blob/main/docs/sdd/example-R-20.4.md) · [Templates](https://github.com/colmandevclub/ColmanDevClub-New-Website/tree/main/docs/sdd/templates)

## API security baseline (S-0.6 / KAN-15)

Set `APP_ORIGIN` to the browser-facing HTTPS origin of the web app, including for
Vercel previews. It is required in production and defaults to `https://localhost:3000`
in development/tests (using `PORT` when overridden). Paths, credentials, queries and
fragments are rejected. The API redirects HTTP requests to this origin with 308,
preserving method, path and query. Helmet sends
`Strict-Transport-Security: max-age=31536000; includeSubDomains`.

The app trusts **one reverse proxy hop** for `X-Forwarded-Proto` and client IPs.
The proxy must overwrite forwarded headers and be the only public entry point.
For local development, use an HTTPS reverse proxy (or an HTTPS Vite dev server that
proxies `/api` and sets `X-Forwarded-Proto: https`), with `APP_ORIGIN` matching the
browser origin. Direct HTTP requests redirect in every environment.

State-changing requests require both `X-CDC-Request: 1` and an exact matching
`Origin: <APP_ORIGIN>`; a missing/foreign/opaque origin returns 403. GET, HEAD and
OPTIONS are exempt. CORS is disabled. JSON bodies are limited to 100kb and cookies
are parsed before routes.

Mount domain routers in `createApp` before `notFound` and `errorHandler`. Route-level
rate limiting precedes authentication, authorization, validation and controllers:

```ts
router.post(
  '/example',
  rateLimit({ windowMs: 60_000, limit: 5 }),
  // authenticate, authorize(policy),
  validate(bodySchema),
  controller,
)
```

Import `rateLimit` from `src/middleware/rateLimit.ts`, `validate` from
`src/middleware/validate.ts`, and `ApiError` from `src/middleware/errors.ts`.
`validate(schema)` replaces the body with parsed Zod output; use
`validate(schema, 'query')` or `validate(schema, 'params')` for other inputs.
Async schemas, transformations and defaults are supported. Validation failures
include dotted field paths (`profile.age`), with `_root` for whole-input errors.

`rateLimit` uses client IPs, groups IPv6 subnets, and returns 429 with `Retry-After`
and standard rate-limit headers. Its default memory store is per process and resets
on restart; supply a shared `store` for limits spanning serverless instances.
Store failures fail closed. Create one limiter per route at startup.

All failures use `{ error: { code, message, fields } }` (`fields` defaults to `{}`).
`ApiError` maps `VALIDATION_ERROR`/400, `UNAUTHENTICATED`/401, `FORBIDDEN`/403,
`NOT_FOUND`/404, `CONFLICT`/409 and `RATE_LIMITED`/429 to fixed generic messages.
Oversized bodies return `PAYLOAD_TOO_LARGE`/413; unexpected failures return
`INTERNAL_SERVER_ERROR`/500. Forbidden/not-found messages reveal no resource details.
Only server-error metadata (generated request ID, status, code) goes to the console;
raw errors, stacks, URLs, headers, bodies and PII are excluded. Library diagnostics
also use fixed codes. Responses include `X-Request-ID` for correlation.

Import configured Mongoose from `src/config/mongoose.ts`; `sanitizeFilter` and
`strictQuery` are enabled globally at app startup. Routes must still validate and
explicitly select allowed filter fields before querying.
