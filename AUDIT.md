# Bethany Pre-Submission Audit

Second-pass adversarial audit covering security (`S`), state integrity (`B`), and media or submission compliance (`M`). Every code defect found below was patched and locked behind a deterministic regression test in `test/backend.test.mjs`.

## Findings and Fixes

| ID | Category | Location | Defect Found | Fix and Regression Test |
| :--- | :--- | :--- | :--- | :--- |
| `S1` | Security | `src/server.mjs` (`getBaseUrl`) | `x-forwarded-proto` and `x-forwarded-host` were concatenated straight into TwiML `<Play>` and `<Gather action>` URLs without validation, letting forged proxy headers inject arbitrary schemes or host strings. | Restricted protocol to `http` or `https` (first comma-separated token) and validated host against `/^[a-z0-9.-]+(?::\d{1,5})?$/i`. Verified by test asserting forged proxy headers fall back safely. |
| `S2` | Security | `src/core/triage.mjs` (`CRISIS_RULES`) | Deterministic self-harm phrases omitted common spoken variants (`want to die`, `overdose`, `overdosed`, `can't go on`), creating a narrow bypass before LLM fallback. | Added those expressions to the deterministic `self_harm` rule before any AI call executes. Verified in the crisis gate test suite. |
| `B1` | State / Privacy | `src/core/store.mjs` (`approveCall`) | `approveCall` rejected `urgent` calls with HTTP `409`, but allowed approving `category === "prayer"` records and writing a volunteer summary into SQLite. Even though `rbac.mjs` still hid prayer records from volunteers, the stored state was wrong. | Blocked `existing.category === "prayer"` inside `approveCall` with HTTP `409 Conflict`. Verified by regression test on seeded prayer record `call-seed-002`. |
| `B2` | State | `src/core/store.mjs` (`approveCall`) | `approveCall` did not check `existing.status === "resolved"`, so a second POST to `/approve` silently reopened completed errands back to `approved`. | Blocked `existing.status === "resolved"` inside `approveCall` with HTTP `409 Conflict`. Verified by regression test resolving then attempting re-approval. |
| `B3` | State | `src/core/store.mjs` (`importSnapshot`) | `importSnapshot` ran `DELETE FROM calls; DELETE FROM audit_log;` outside a SQLite transaction before inserting rows. A malformed or partial Upstash snapshot could fail mid-loop and wipe local data. | Wrapped `importSnapshot` in `BEGIN IMMEDIATE` / `COMMIT` with `ROLLBACK` on error. Verified by injecting a malformed row and asserting existing seeded calls survive untouched. |
| `M1` | Media / Compliance | `public/index.html`, `src/core/fixtures.mjs`, `.gitignore` | Confirmed synthetic congregation data compliance (Rule 5), synthetic audio labeling, and secret isolation. | All 4 congregation personas use synthetic names and FCC reserved `(555) 014-xxxx` numbers. The Psalm 23 clip is labeled synthetic demo audio in both UI and API metadata. `.env` is gitignored and absent from version control. |

## Security Boundaries Verified by Automated Tests

- **Server-side RBAC (CVE-2025-48757 defense):** `GET /api/calls` defaults to `volunteer` when no role header is passed. Volunteer JSON physically excludes `rawTranscript`, `callerName`, `callerPhone`, `redactedItems`, `pastoralSummary`, unapproved calls, private prayers, and urgent escalations.
- **Strict caller scoping (`Rock#7183` defense):** Querying `GET /api/calls?callerId=unknown-999` returns `0` records instead of falling back to the full table.
- **Pastoral sign-off (`uiOnly: true`):** Incoming errands land in `pending_review`. Nothing appears in volunteer payloads until a pastor explicitly calls `POST /api/calls/:id/approve`.
- **Twilio webhook integrity:** `POST /api/twiml` verifies HMAC-SHA1 `X-Twilio-Signature` with `crypto.timingSafeEqual` whenever `TWILIO_AUTH_TOKEN` is configured, returning HTTP `403` on forged signatures.
- **CSV formula injection defense:** `src/core/exportCsv.mjs` prefixes leading `=`, `+`, `-`, `@`, `\t`, and `\r` characters with a single quote in both Genesis ChMS and Planning Center People exports, and rejects unknown `format` query values with HTTP `400`.
- **Static path traversal defense:** `tryServeStatic` resolves canonical paths under `public/` and returns HTTP `404` for encoded traversal attempts such as `/%2e%2e/package.json`.

## Known Shortcuts and Upgrade Path

Every intentional hackathon shortcut is tagged with `shortcut:` in the source code:

1. **Demo role header (`src/core/rbac.mjs`):** `x-bethany-role` lets judges switch between Pastor and Volunteer views on `/judge` without creating an account. Before real church rollout, replace it with signed HTTP-only session cookies and per-church tenant row-level security.
2. **Upstash snapshot key (`src/core/store.mjs`):** Serverless state sync stores the ledger under one JSON key in Upstash Redis (`bethany:state:v1`). Move to indexed Postgres rows once a congregation passes roughly 500 calls.
3. **Optional Twilio signature in local demo (`src/core/ivr.mjs`):** Signature verification activates automatically when `TWILIO_AUTH_TOKEN` is set in the environment and stays bypassed only when unset locally.
4. **LLM fallback (`src/core/triage.mjs`):** If no API key is configured or a free-tier provider returns `429`, structured intake falls back to the local deterministic parser without breaking the call flow.
