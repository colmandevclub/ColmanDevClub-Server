# S-1.2 / KAN-18 — Email service and templates

Version 1.3 · 2026-11-15 · 3 story points · Sprint 2  
Owner: Elad Abutbul · Reviewer: Almog Lavi  
Requirements: T-22, R-04.4, R-08.1, R-08.2, R-13.1, R-29.8 · DESIGN §11  
Prerequisite: [KAN-14](https://almoglavi29.atlassian.net/browse/KAN-14), reported Done in Jira on 2026-11-14.

This guide records the server implementation against the audited story. Canonical
spec restoration remains [KAN-114](https://almoglavi29.atlassian.net/browse/KAN-114);
`docs/specs/` is absent from the checked-out baseline. It does not replace those specs.

## Owner-confirmed DESIGN §10 / T-21 correction

The selected storage provider is **Cloudinary**, as confirmed in KAN-14 and KAN-18.
Legacy Supabase references in DESIGN v0.3 §10/T-21 are stale and must be replaced
during canonical spec restoration. Club-owned credentials remain server-side;
private materials require access-controlled delivery. Email uses Gmail independently
of storage. This story adds no storage implementation or Supabase dependency.

## Service contract and templates

`src/services/email/index.ts` exports the configured `emailService: EmailService`.
Domain services call `await emailService.send(to, template, data)`; controllers
remain responsible only for HTTP. The typed template map and strict runtime Zod
schemas are in `src/schemas/email.ts`.

| Template                    | Required data                                                               | Optional data | Requirement |
| --------------------------- | --------------------------------------------------------------------------- | ------------- | ----------- |
| `registration-confirmation` | `fullName`, `status: registered \| waitlisted`, `setPasswordUrl`            | —             | R-04.4      |
| `admission-accepted`        | `fullName`, `academicYear`, `signInUrl`                                     | —             | R-29.8      |
| `verify-email`              | `fullName`, `verificationUrl`                                               | —             | R-08.1      |
| `reset-password`            | `fullName`, `resetPasswordUrl`                                              | —             | R-08.2      |
| `invite`                    | `role: applicant \| member \| mentor \| admin`, `academicYear`, `inviteUrl` | `fullName`    | R-13.1      |

The domain service generates each action link after committing its mutation. Links
must be HTTPS, without URL credentials, on the configured `APP_ORIGIN`. Recipient
validation allows one bare email address. HTML escapes all dynamic text and URLs.
All messages have Hebrew subjects, `lang="he"`, RTL layout, isolated LTR URLs,
and complete UTF-8 plain-text alternatives. Invite roles have Hebrew labels.

The copy explains single-use links and the design lifetimes: verification 24 hours,
reset/set-password 1 hour, invite 7 days. Token generation, hashing, expiry enforcement,
consumption and account permissions belong to their auth/application/invite stories;
templates do not implement those rules. Scope is the email service, adapters and
five templates only. Account creation, password/token operations, database models,
authentication routes and production web forms belong to their own stories.
No production endpoint is added; existing OpenAPI route coverage is retained.

## Configured sender and mail-only testing

The configured club Gmail account is both the SMTP login and the From address.
The actual user/app password live only in the gitignored local `.env` with private
file permissions. No credentials are copied into templates, source, evidence or
Postman. The owner clarified on 2026-11-15 that this request configures the sender;
it does not add signup or password-recovery business logic.

Run `pnpm dev:email` and open `http://127.0.0.1:4180/` to select a template and
send a sample message. An optional recipient address can be supplied; leaving it
blank sends to the configured club mailbox. This tester has no database, account
creation, passwords or real verification/reset tokens. Message links are synthetic
examples, so they do not perform account actions.

The standalone development tester binds to loopback, validates Host/Origin and a
custom request header, bounds JSON size and rate-limits sends. It refuses production
and Vercel environments. It is absent from `createApp` and the deployed API. Its
`POST /__dev/send-test-email` body is `{template, to?}`; the response contains only
`{status, template}`, where status is `smtp_accepted`, `preview` or `failed`. No
recipient, body or token appears in application logs or delivery-status responses.

Import [the mail-only Postman collection](postman/email.postman_collection.json)
from the tester's download link. Its first request sends a selected sample template
and checks for real SMTP acceptance. Do not put SMTP credentials in Postman.
Previously observed sender authentication and two SMTP acceptances are recorded in
[redacted sender evidence](evidence/s-1.2/sender-check.json). That record does not
claim inbox confirmation or implemented account flows.
A connection-only check on port 465 on 2026-11-15 timed out before authentication
(`ETIMEDOUT`, connection stage). Switching to port 587 with mandatory STARTTLS
authenticated successfully. Following the owner's explicit request, three sample
messages (registration confirmation, admission acceptance and Mentor invitation)
were sent through the local tester and shared Gmail adapter to the configured club
mailbox. Gmail accepted all three. Inbox visibility and email-client rendering
still require confirmation by the owner in that mailbox.

### R-29.8 — Owner-confirmed admission email addition

On 2026-11-14 the owner requested a fifth transactional template confirming that
an applicant passed the assessment and was accepted into the club. The request
adds R-29.8 / D34 to REQUIREMENTS v1.1, DESIGN v0.4 §11 and S-1.2/S-3.6 in TASKS.
It is also recorded in the explicitly requested web file
`docs/sdd/templates/requirement.md` for canonical restoration under KAN-114.

`admission-accepted` says "עברת את המיונים בהצלחה והתקבלת למועדון הפיתוח!",
includes the applicant's name and Academic Year, and links to the existing sign-in
screen. It has the same HTML/text, validation, escaping and safe-delivery behavior
as the other templates. The sign-in link contains no authentication token and the
message makes no single-use/expiry claim. Its information notice reminds the user
that an unverified email must still be verified before accessing member content.
The existing role-based `invite` template remains available, including for Mentors.

**Integration remains S-3.6:** send only after a committed transition from another
admission status to Accepted, to the accepted applicant's account address, with the
membership's year label. An already-Accepted write or a failed transaction must not
send a new email. Await the shared service outside the transaction; SMTP failure
must not roll back or repeat the acceptance mutation. This task implements and
previews the template, not the absent admission-decision endpoint. It adds no
general notifications and changes no access policy.

## Visual design

The email palette mirrors the current web repository's `src/constants/theme.css`:
purple `#6b5ba8`, deep purple `#2e2350`, lavender `#f1eef8`, white surfaces and
the approved ink colors. Literal tokens live in `src/services/email/theme.ts`, since
email rendering must not depend on the website's CSS loading. Keep the two palettes
aligned when the brand changes. The `ColmanDevClub` wordmark stays as text; the code
glyphs are decorative, not an invented official logo.

Each message has a short Hebrew hero headline, a single purple primary action,
a lavender link-safety notice, and an isolated LTR fallback URL. Original subjects,
recipient data, functional copy, link lifetimes, action labels and plain-text parts
remain intact. The registration headline confirms receipt, including for waitlisted
applicants; it does not imply acceptance into the club.

The production email uses a responsive 600px single-column presentation table,
inline styles and Hebrew-capable system fonts. At narrow widths, padding and headline
size decrease and the action fills the content width. The dark hero retains a solid
background when its decorative gradient is unavailable. No remote images, fonts,
tracking pixels, scripts or stylesheets are loaded by the email. Media queries and
the selected style properties are covered in the official
[Gmail CSS reference](https://developers.google.com/workspace/gmail/design/css).
Actual Gmail/Outlook rendering remains a separate provider review.

`pnpm email:preview` builds a local review gallery with Hebrew template selection,
600px/320px width controls and a plain-text switch. Its interactive HTML is development
tooling in `src/scripts/email-preview.html`; scripts are never included in sent emails.

## Configuration and adapters

| Environment          | Default adapter | Configuration                                            |
| -------------------- | --------------- | -------------------------------------------------------- |
| Local development    | `console`       | Metadata only; no SMTP connection                        |
| `NODE_ENV=test`      | `test`          | In-memory capture; no SMTP connection                    |
| `VERCEL_ENV=preview` | `console`       | Explicit `EMAIL_ADAPTER=gmail` for a provider smoke test |
| Production           | `gmail`         | Requires `GMAIL_USER` and `GMAIL_APP_PASSWORD`           |

`VERCEL_ENV=production` takes precedence over development/test. A production process
outside a Vercel preview also requires Gmail. Production rejects console/test adapters,
and the test adapter is restricted to `NODE_ENV=test`. All keys appear in `.env.example`.
The club's Gmail app password is a secret, distinct from its normal account password;
spaces in the 16-letter app password are normalized. Never put actual credentials in
fixtures, documentation, a commit or console output.

The Gmail adapter uses `smtp.gmail.com:587` with mandatory STARTTLS, authenticates as
the club-owned account, and uses the same address in From. The adapter refuses to
authenticate or send if the TLS upgrade fails. Port 465 timed out on the local
network; port 587 authenticated successfully on 2026-11-15. Both ports are documented
in [Google's Gmail SMTP guide](https://developers.google.com/workspace/gmail/imap/imap-smtp).
Nodemailer diagnostics and transaction
logging are disabled, as are filesystem/URL content reads. See the official
[SMTP options](https://nodemailer.com/smtp) and
[Gmail setup](https://nodemailer.com/guides/using-gmail).

`console` emits only `{ code: 'EMAIL_PREVIEW', template, adapter: 'console' }`.
It never prints names, contact details, action URLs, tokens, subjects or message bodies.
For assertions, inject a `TestEmailAdapter` through `createEmailService(adapter, origin)`;
its `messages` contain the complete rendered messages in memory and `clear()` resets them.
Do not log this capture or use it to retain real recipient data.

## Delivery failure and mutation boundary

- **One attempt per `send`, zero automatic retries.** SMTP timeouts can occur after
  acceptance, so retries could duplicate the email. There is no queue or durable
  delivery guarantee in this story; successful SMTP acceptance is not proof of inbox delivery.
- Each DNS/connection/greeting/socket wait is limited to 5 seconds. An abort signal
  bounds the whole send to 10 seconds and cancels its SMTP connection.
- Await `send` **after the database transaction commits**, before completing the
  request. Do not wrap the mutation plus email in a retry loop, run SMTP within a
  transaction, or launch an unawaited send in a serverless handler.
- Recipient rejection, SMTP/abort errors and invalid rendering input are caught.
  `send` resolves `void`, preserving the caller's committed result. The only failure
  log is `{ code: 'EMAIL_DELIVERY_FAILED', adapter }`; no provider errors, responses,
  stacks, recipients or template data are recorded. For diagnostics, use occurrence
  counts rather than raw error output.
- No delivery status is persisted. A later resend flow must mint/validate its token
  according to its domain contract and retry only the email action, never the
  original account/application mutation. An ambiguous timeout can still mean the
  original message was accepted. Generic auth responses must remain unchanged.

## Verification and review evidence

`src/tests/email.test.ts` uses requirement-prefixed positive and negative tests for
all five templates, registered/waitlisted copy, successful-admission/year copy, escaping, unsafe
links and recipients, safe console/error logs, rejection and single-attempt behavior.
A test consumer commits a write once and still returns 201 when SMTP fails. A real
local TCP server stalls its SMTP greeting; the actual Nodemailer transport is aborted
with `EABORT`. A stream transport composes real UTF-8 multipart/alternative MIME.
No automated test sends live email. The deployment resolver check includes the email
entrypoint as well as the app.

Run `pnpm test`, `pnpm docs:check`, `pnpm lint`, `pnpm format:check`, `pnpm build`.
Use the repository's pinned pnpm version (`10.32.1`); CI runs Node 22.

Manual evidence recorded on 2026-11-14:

- `pnpm email:preview` generated HTML and text for the five templates and waitlisted
  confirmation, using synthetic data only, at `.email-preview/index.html` (gitignored).
  The gallery provides 600px and 320px width controls and a plain-text switch.
- **Local browser review completed:** reviewed registration and verification layouts,
  the invitation's role/year copy and plain-text switch. The original five generated variants
  were checked at a 320px viewport with RTL and no horizontal overflow. The gallery
  was checked at 360px with no page overflow. See the captured
  [desktop registration](evidence/s-1.2/registration-desktop.jpg),
  [mobile registration](evidence/s-1.2/registration-mobile.jpg) and
  [responsive measurements](evidence/s-1.2/responsive.json). These are synthetic local
  examples, not proof of inbox delivery or email-client rendering approval.
- [Palette contrast calculations](evidence/s-1.2/contrast.json) record 5.70:1 for
  white on the purple action and 5.82:1 for muted text on the lavender notice.
  Hero white text is at least 7.32:1 against the gradient's endpoint colors.
- **R-29.8 acceptance preview reviewed:** the sixth gallery entry (five templates
  plus waitlisted confirmation) now includes "התקבלת למועדון". Checked the success
  message, year, sign-in action and verification reminder in the local browser.
  [Acceptance screenshot](evidence/s-1.2/admission-accepted-desktop.jpg) and
  [desktop/320px measurements](evidence/s-1.2/admission-accepted-responsive.json)
  record RTL with no horizontal overflow. The screenshot uses synthetic data and
  does not demonstrate the future S-3.6 automatic trigger or live delivery.
- **Gmail sender connection checked:** SMTP authentication succeeded and Gmail accepted
  two earlier sample messages. On 2026-11-15, port 465 timed out; mandatory STARTTLS
  on port 587 authenticated successfully and Gmail accepted three additional sample
  messages requested by the owner. All three went through the shared service and the
  Gmail adapter. Inbox confirmation and rendering inside actual email clients remain
  pending. Keep recipient, credentials and token-bearing screenshots out of logs and
  PR evidence.
- **Three-message live smoke test on 2026-11-15:**
  [local delivery-status screenshot](evidence/s-1.2/three-smtp-acceptances.jpg)
  records SMTP acceptance for registration confirmation, admission acceptance and
  the Mentor invitation. The screenshot contains delivery metadata only; it is
  not an inbox or provider-rendering confirmation.
- **Deployed Swagger/reviewer review pending:** no PR, push or deployment was made.
  After publication, inspect `/api/docs` on the paired preview and obtain Almog's review.
  No email send endpoint should appear. KAN-14 deployment secrets and provider access
  still require verification in that environment; a Jira Done status is not live evidence.

## Changelog

Version 1.3 (2026-11-15): configured the Gmail sender and mail-only local/Postman
tester. Scope is limited to sending/templates; account workflows are not included.

| Version | Date       | Change                                                                                                                                                  |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2     | 2026-11-14 | Added owner-confirmed R-29.8 / D34 admission-accepted template, validation tests and preview; documented S-3.6 trigger and unchanged verification gate. |
| 1.1     | 2026-11-14 | Website palette, futuristic email art direction, responsive review gallery, local visual/contrast evidence.                                             |
| 1.0     | 2026-11-14 | S-1.2 implementation, bounded failure policy, safe adapters, template contracts, Cloudinary correction and review evidence.                             |
