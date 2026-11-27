# Senior gap audit: Bethany

2026-11-27 · Stage assumed: Hackathon MVP / public zero-login prototype (`v0.1.0`, 100% synthetic congregation data) · Read in full: `api/index.js`, `src/server.mjs`, `src/core/triage.mjs`, `src/core/store.mjs`, `src/core/rbac.mjs`, `src/core/ivr.mjs`, `src/core/exportCsv.mjs`, `src/core/fixtures.mjs`, `public/index.html`, `public/phone.html`, `public/app.js`, `public/styles.css`, `test/backend.test.mjs`, `package.json`, `vercel.json`, `.env.example`, `AUDIT.md`, `README.md`, and last 18 git commits; probed live `https://bethany-sigma.vercel.app` (`/`, `/phone`, `/api/health`, `/api/sermon/audio`, `/api/transcribe`, `/api/calls`) and inspected desktop (`1440x900`), laptop (`1280x650`), and mobile (`390x844`) renders.

> This is a gap-finding self-check, not an assurance audit. Closing these gaps brings the app close to what a senior engineer and designer would build; it doesn't certify that it is secure, production-ready or well designed.

## Verdict

**Senior Engineer:** For a 48-hour hackathon prototype, the backend architecture is unusually disciplined: zero external npm dependencies, real SQLite `CHECK` constraints and transactions, server-side RBAC projection that strips sensitive fields before JSON serialization, timing-safe Twilio HMAC verification, and 22 integration tests that hit a real HTTP server. The biggest gaps are operational and telephony realism: live Vercel microphone transcription currently returns `502 (upstream HTTP 401)` while the header claims Groq is live, the real Twilio `<Record>` webhook drops caller voicemails because `TranscriptionText` is not sent synchronously to `<Record action>`, Upstash state sync has a last-writer-wins race across LLM calls, and there is no rate limiting or GitHub CI. *(Note: if real church callers used this today, the unauthenticated `x-bethany-role` demo header would be a Critical finding capping Engineering at 5/10.)*

**Senior Product Designer:** Splitting the Austin Stone editorial landing page (`/`) from the workspace (`/phone`) and adding the open-ground `1 -> 2 -> 3` guide gave the app real visual calm, clear hierarchy, and almost zero dead CSS (`166/167` classes used). Where a senior designer would push back is interaction completeness and accessibility polish: the Pastor/Volunteer switcher uses ARIA `role="tab"` without `tabpanel` or arrow-key support, muted `12px` labels dip slightly below WCAG AA contrast on warm ivory surfaces, the destructive `Reset demo` button sits unguarded beside `API JSON`, and pastors have no UI field to edit the volunteer summary before approving even though the API supports it.

**Engineering: 7/10 · Design: 7/10**

| Engineering area | Score | One-line reason |
|---|---|---|
| 1. Security and access control | 6 | Strong server-side RBAC projection, path-traversal guard, and HMAC check, but no rate limits on AI/reset routes, wildcard CORS (`*`), and demo header auth (`x-bethany-role`). |
| 2. Data model and integrity | 7 | Clean SQLite `CHECK` constraints, indexes, and transactional snapshot import, held back by Upstash full-JSON overwrite races and ephemeral `/tmp` in live prod. |
| 3. Architecture and boundaries | 8 | Focused modules under `src/core/` (`74` to `501` lines) with zero framework bloat; `public/app.js` (`626` lines) mixes landing and console DOM via `.innerHTML`. |
| 4. Error handling and resilience | 6 | External calls have `AbortController` timeouts, but `server.mjs` swallows `500` stack traces without `console.error`, Twilio `<Record>` drops real recordings, and buttons lack in-flight locks. |
| 5. Testing and verification | 7 | `22/22` real HTTP + SQLite integration tests pass in `2.1s`, but `.github/workflows` CI is absent and `626` lines of frontend JS have zero automated tests. |
| 6. Code hygiene and consistency | 8 | Zero `TODO`s, `1` `console.log` (startup banner), clean atomic git history, and `166/167` CSS classes used; minor copy-pasted seed loop in `store.mjs`. |
| 7. Performance | 8 | `0` client bundle dependencies, HTTP `206` Range audio streaming, SQLite WAL + indexes, and `Promise.all` boot fetch; Upstash full-ledger sync will degrade past ~500 calls. |
| 8. Operations and delivery | 6 | Clean Vercel config and `/api/health` diagnostics, but live prod currently runs `vercel_tmp_ephemeral` with a broken `401` Groq key and zero server error logging. |
| 9. Dependencies and configuration | 8 | Zero npm runtime dependencies eliminates CVE churn; `.env.example` omits several optional env vars read in code and startup does not probe upstream key validity. |
| 10. Docs and developer experience | 9 | Clear `README.md`, `AUDIT.md`, `CONTRIBUTING.md`, `docs/PLAN.md`, and `npm run verify` / `smoke` scripts let a new developer boot in under two minutes. |
| 11. Product and scope judgement | 7 | Core demo loop is tight and honest about synthetic data, though `/api/audit` and `volunteerSummaryOverride` were built in the backend with no UI surface. |

| Design and UX area | Score | One-line reason |
|---|---|---|
| 1. Hierarchy and layout | 8 | Strong full-bleed documentary hero on `/` and spacious `48px`-gutter `1 -> 2 -> 3` flow on `/phone` with clear focal weight. |
| 2. Typography | 7 | Clean `Plus Jakarta Sans` + `JetBrains Mono` pairing with `tabular-nums`, but `styles.css` uses every integer pixel size from `12px` to `20px` (`14` sizes total). |
| 3. Colour, contrast and theming | 7 | Warm Austin Stone palette (`#22201d`, `#3c4331`, `#f7f5f0`) avoids AI purple/glows, but `.audio-card-note` (`~3.9:1`) and `--text-muted` on ivory (`~4.15:1`) miss WCAG AA `4.5:1`. |
| 4. Component consistency | 7 | Consistent button press physics and hairline ledger rows, with `11` distinct `border-radius` steps (`2px` to `100px`) and `10` raw hex literals outside `:root`. |
| 5. Navigation and information architecture | 7 | Dedicated `/phone` tab solved page crowding, but mobile `<=640px` hides `.nav-links` and `.brand-name` with no menu, and `target="_blank"` strands mobile Back navigation. |
| 6. Core flows and feedback | 7 | Audible DTMF keypad and Pastor -> Volunteer RBAC switch work smoothly, but `Reset demo` has no confirmation, preset/approve clicks lack disabled states, and `Press 0` impersonates Evelyn. |
| 7. Forms and input | 8 | Explicit `<label for>` bindings, `maxlength`, preserved input on failure, and disabled `submit-call-btn` while sending; missing Pastor override input on approval. |
| 8. States: loading, empty, error, success | 7 | Thoughtful empty states per role and toast feedback, but `/phone` status bar falsely shows `"Groq Whisper + LLM live"` when Groq returns `401`, and cards lack per-item loading spinners. |
| 9. Accessibility | 6 | Good skip links, `focus-visible` contrast overrides on dark bands, and `prefers-reduced-motion`, held back by incomplete ARIA `tablist` wiring and non-seekable `<div>` audio bars. |
| 10. Responsive and mobile | 8 | Zero horizontal overflow at `390x844` and `overflow-wrap: anywhere` handles worst-case strings; mobile landing header strips too much context (`brand-name` + section links). |
| 11. Copy and microcopy | 8 | Direct, calm church tone with zero banned buzzwords, marred only by internal engineering terms (`HTTP 409`, `Rock#7183`) appearing on the public landing page. |

---

## Fix first (Status: All 6 Closed in Follow-Up Pass)

1. **[Engineering · High · Effort: S] Fix the invalid `GROQ_API_KEY` on Vercel and stop `/phone` from claiming Groq is live when auth fails.**
   - *Why a senior cares:* Live users clicking **Record mic** hit an immediate `502` error even though the header promises `"Groq Whisper + LLM live"`.
   - *Evidence:* `POST https://bethany-sigma.vercel.app/api/transcribe` returns `{"error":"Upstream speech-to-text provider timed out or rejected the audio payload (upstream HTTP 401)."}`, while `GET /api/health` returns `"aiMode":"groq_free_tier"` and `public/app.js:609-614` renders `"Groq Whisper + LLM live"`.
   - *Fix:* Re-paste the working 56-character `GROQ_API_KEY` in Vercel and redeploy; optionally record last upstream auth failure in `/api/health` so the status bar downgrades honestly to `"Deterministic local fallback (Groq key rejected)"`.

2. **[Engineering · High · Effort: S] Handle real Twilio `<Record>` webhooks so landline voicemails are not silently discarded.**
   - *Why a senior cares:* If anyone connects a real Twilio number and presses `2`, Bethany says *"Thank you. Your message has been received"* and drops the call on the floor without saving a record.
   - *Evidence:* `src/core/ivr.mjs:124` emits `<Record action=".../api/twiml?step=recorded" ... transcribe="true" />` without `transcribeCallback`. Twilio sends `RecordingUrl` (not `TranscriptionText`) to `action`, so in `src/server.mjs:277-288` `transcript` is `""`, `if (transcript)` is skipped, and line `293` still plays the success message.
   - *Fix:* Add `transcribeCallback="${cleanBase}/api/twiml?step=transcribed"` on `<Record>` in `src/core/ivr.mjs:124`, or fetch `body.RecordingUrl` with Twilio Basic Auth in `src/server.mjs:278` and pass the audio buffer straight to `transcribeAudioBuffer()`.

3. **[Engineering · High · Effort: S] Log unhandled `500` errors on the server and add per-IP rate limiting on `/api/transcribe`, `/api/calls`, and `/api/demo/reset`.**
   - *Why a senior cares:* Unlogged `500`s leave production incidents invisible in Vercel Logs, and unthrottled AI/reset endpoints let one script burn Groq quota or wipe the demo mid-review.
   - *Evidence:* `src/server.mjs:428-432` catches errors and returns `"Internal server error."` with zero `console.error(err)`. `src/server.mjs:247,337,418` accept unthrottled POSTs with `Access-Control-Allow-Origin: *` (`src/server.mjs:72`).
   - *Fix:* Add `if (status >= 500) console.error("[bethany]", req.method, req.url, err);` in `src/server.mjs:429`, restrict `CORS_ORIGIN` to same-origin by default, and add a 30-line fixed-window `Map` rate limiter (`e.g. 20 writes/min/IP`).

4. **[Engineering · High · Effort: S] Connect Upstash Redis on Vercel and narrow the sync window around `analyzeCallMessage`.**
   - *Why a senior cares:* Without Upstash, serverless cold starts wipe pastor approvals; with Upstash, reading state *before* a 1.5-second LLM call overwrites concurrent approvals.
   - *Evidence:* Live `/api/health` reports `"persistenceMode":"vercel_tmp_ephemeral"`. In `src/server.mjs:354-357`, `await store.syncFromRemote()` runs before `await analyzeCallMessage(...)`, and `await store.syncToRemote()` (`src/core/store.mjs:231-232`) overwrites the entire `bethany:state:v1` key.
   - *Fix:* Provision Upstash Redis in Vercel Storage (2 clicks), and move `await store.syncFromRemote()` in `src/server.mjs:354` to run *immediately after* `analyzeCallMessage` right before `store.createCall(analyzed)`.

5. **[Design · High · Effort: S] Complete the WAI-ARIA `tablist` contract and fix the two `<4.5:1` small-text contrast pairs.**
   - *Why a senior cares:* Bethany's mission explicitly serves blind and low-vision people; broken ARIA tab semantics and low-contrast `12px` captions undermine that promise on screen readers and low-vision displays.
   - *Evidence:* `public/phone.html:193-196` declares `role="tablist"` and `role="tab"` with no `role="tabpanel"`, `aria-controls`, or Left/Right arrow-key handler in `public/app.js:498-508`. `.audio-card-note` (`public/styles.css:432-436`, `rgba(255,255,255,0.56)` on `#1c1a17`) is `~3.9:1`, and `--text-muted` (`#78726a`, `public/styles.css:12`) on `--bg-subtle` (`#f7f5f0`) is `~4.15:1`.
   - *Fix:* Link `aria-controls="ledger-panel"` + `role="tabpanel"` + Left/Right arrow-key listener in `app.js`, raise `.audio-card-note` to `rgba(255,255,255,0.72)` (`5.8:1`), and darken `--text-muted` from `#78726a` to `#666059` (`5.3:1` on `#f7f5f0`).

6. **[Design · Medium · Effort: S] Guard `Reset demo`, disable action buttons while requests are in flight, and let pastors edit `volunteerSummary` before approving.**
   - *Why a senior cares:* One accidental click on `Reset demo` wipes custom test calls, double-clicking `Approve` writes duplicate audit rows, and regex PII redaction needs a human edit escape hatch when callers mention unlisted details (such as nursing-home room numbers).
   - *Evidence:* `public/phone.html:206` places `Reset demo` right beside `API JSON` with identical `.tool-btn` styling (`public/app.js:588-596` fires `POST /api/demo/reset` immediately). `public/app.js:369,546` do not disable buttons during `fetch`. `src/server.mjs:377` already accepts `body.volunteerSummary`, but `public/app.js:263-265` renders no input for it.
   - *Fix:* Add a two-tap `"Confirm reset?"` state on `btn-reset-demo`, set `btn.disabled = true` in `finally` blocks on preset/approve/resolve clicks, and make the `.volunteer-preview-strip` editable for pastors prior to approval.

---

## Engineering findings

### 1. Security and access control
- **High (Prototype) / Critical (Before Real Users) · Tell: No · Effort: M** — Client-controlled role header (`x-bethany-role`) grants full pastor PII access, CSV export, and demo reset without authentication. Evidence: `src/core/rbac.mjs:8` (`req.headers?.["x-bethany-role"] || url?.searchParams?.get("role")`), `src/server.mjs:327,370,395,419`. Tagged intentionally with `shortcut:` for zero-login hackathon judging; replace with signed HTTP-only session cookies and per-church tenant RLS before real congregant use.
- **High · Tell: No · Effort: S** — No rate limiting on `POST /api/transcribe` (`6 MB` body), `POST /api/calls`, or `POST /api/demo/reset`. Evidence: `src/server.mjs:247,337,418`. Fix: add per-IP token bucket (`20 req/min` on writes, `6 req/min` on `/api/transcribe`).
- **Medium · Tell: Yes · Effort: S** — Wildcard `Access-Control-Allow-Origin: *` combined with `Access-Control-Allow-Headers: Content-Type, x-bethany-role`. Evidence: `src/server.mjs:72-74`. Fix: omit CORS headers when `CORS_ORIGIN` is unset (same-origin app) or restrict to configured domain.
- **Medium · Tell: No · Effort: S** — Case-sensitive doctor regex and finite medical allowlist leave PII redaction gaps on lowercase Whisper output. Evidence: `src/core/triage.mjs:47` (`DOCTOR_RE` uses `/g` without `i`, missing `"dr patel"`), `src/core/triage.mjs:48-49` (`MEDICAL_RE` misses common senior medications like `"gabapentin"` or `"furosemide"` and facility rooms like `"Room 214"`). Fix: add `/gi` + `doctor|nurse` to `DOCTOR_RE`, expand room/facility patterns, and expose `volunteerSummary` editing to the pastor in the UI.
- **Low · Tell: No · Effort: S** — Any caller with `volunteer` role can resolve any approved call ID and spoof `actorName` in `audit_log`. Evidence: `src/server.mjs:389-396`. Fix: tie resolution to authenticated deacon session once auth lands.

### 2. Data model and integrity
- **High · Tell: No · Effort: S** — Upstash Redis sync (`GET` -> local SQLite -> `SET bethany:state:v1`) has a lost-update race across the `analyzeCallMessage` LLM await. Evidence: `src/server.mjs:354-357`, `src/core/store.mjs:215-234`. Fix: re-sync right before `createCall` in the short term; move to row-level Postgres/Upstash HSET operations before multi-user launch.
- **High · Tell: No · Effort: S** — Live Vercel production currently uses ephemeral `/tmp/bethany.db`. Evidence: `GET https://bethany-sigma.vercel.app/api/health` -> `"persistenceMode":"vercel_tmp_ephemeral"`. Fix: attach free Upstash Redis in Vercel Storage.
- **Low · Tell: No · Effort: S** — No schema version (`PRAGMA user_version`) or migration runner. Evidence: `src/core/store.mjs:81-132`. Fix: record `PRAGMA user_version = 1` and run numbered `ALTER TABLE` steps on startup.

### 3. Architecture and boundaries
- **Low · Tell: No · Effort: S** — `public/app.js` (`626` lines) bundles landing-page nav/audio logic and `/phone` care desk logic in one file and renders cards via string `.innerHTML`. Evidence: `public/app.js:26,203-295,490`. Also `escapeHtml` (`public/app.js:37-43`) omits `'` -> `&#39;` (safe today because all attributes use `"`). Fix: add `.replace(/'/g, "&#39;")` to `escapeHtml` and split `landing.js` from `phone.js` if UI grows.

### 4. Error handling and resilience
- **High · Tell: No · Effort: S** — Real Twilio `<Record>` webhook (`POST /api/twiml?step=recorded`) silently drops recordings when `TranscriptionText` is absent. Evidence: `src/core/ivr.mjs:124`, `src/server.mjs:277-298`. Fix: wire `transcribeCallback` or fetch `RecordingUrl` into `transcribeAudioBuffer`.
- **Medium · Tell: Yes · Effort: S** — Unhandled `500` exceptions in `src/server.mjs:428-432` are never logged (`0` `console.error` calls), and `5` `catch {}` blocks silently discard errors (`src/core/triage.mjs:229,252,279`, `src/core/store.mjs:150,223`). Fix: log structured one-line error summaries with status/code (never secrets or raw transcripts).
- **Medium · Tell: No · Effort: S** — No idempotency key on Twilio `CallSid` / `RecordingSid` (`src/server.mjs:277-310`), so webhook retries create duplicate urgent/voicemail rows. Fix: add `external_sid TEXT UNIQUE` on `calls`.

### 5. Testing and verification
- **High · Tell: Yes · Effort: S** — No GitHub Actions CI workflow (`.github/workflows` does not exist), so broken pushes are not gated automatically. Fix: add a 20-line `.github/workflows/ci.yml` running `npm run verify` and `npm run smoke` on Node 24.
- **Medium · Tell: No · Effort: M** — Zero automated tests cover `public/app.js` (`626` lines) or real Twilio `<Record action>` payload shapes (`RecordingUrl` without `TranscriptionText`). Fix: add 1 Playwright smoke test for `/phone` and 1 webhook test posting `{ RecordingUrl, CallSid }`.

### 6. Code hygiene, configuration, and operations
- **Low · Tell: No · Effort: S** — Duplicate 13-line seeding loop in `src/core/store.mjs:464-476` and `482-494`, unused `.sr-only` rule in `public/styles.css:60-69`, and undocumented optional env vars (`OPENAI_API_KEY`, `GROQ_MODEL`, `GROQ_WHISPER_MODEL`, `GEMINI_MODEL`, `OPENAI_MODEL`, `BETHANY_DB_PATH`, `CORS_ORIGIN`) absent from `.env.example`.

---

## Design and UX findings

### 1. Accessibility (`WCAG 2.2 AA`)
- **High · Tell: No · Effort: S** — Incomplete ARIA `tablist` on `/phone` (`public/phone.html:193-196`, `public/app.js:498-508`): buttons use `role="tab"` and `aria-selected`, but `#ledger-panel` lacks `role="tabpanel"` / `aria-labelledby`, tabs lack `aria-controls` and `tabindex` roving focus, and Left/Right arrow keys do nothing.
- **Medium · Tell: No · Effort: S** — Two small-text (`12px`–`13px`) colour pairs dip below WCAG AA `4.5:1`: `.audio-card-note` (`public/styles.css:432-436`, `rgba(255,255,255,0.56)` on dark card = `~3.9:1`) and `--text-muted` (`#78726a`, `public/styles.css:12`) on `--bg-subtle` (`#f7f5f0` = `~4.15:1`) and `--bg-ivory` (`#fbfaf7` = `~4.38:1`).
- **Medium · Tell: No · Effort: S** — Sermon progress bars (`public/index.html:96`, `public/phone.html:97`) are `aria-hidden="true"` `<div>`s with no keyboard seek or `-10s / +10s` controls.

### 2. Core flows, states, and feedback
- **Medium · Tell: No · Effort: S** — `/phone` topbar (`public/app.js:608-615`) displays `"Groq Whisper + LLM live"` even when Groq rejects the key with `401`, creating a jarring trust break when **Record mic** immediately fails.
- **Medium · Tell: No · Effort: S** — `Reset demo` (`public/phone.html:206`) uses the same neutral `.tool-btn` look as `Genesis CSV` and `API JSON` and wipes state on a single click with no confirmation or undo.
- **Medium · Tell: No · Effort: S** — Pressing `0` on the handset (`public/app.js:354-359`) submits the `evelyn_urgent` preset ("Evelyn Brooks" fall transcript) instead of logging an anonymous keypad `0` callback like `POST /api/twiml` (`src/server.mjs:303-308`) does, conflating Step 1 (keypad) with Step 2 (preset voicemail).
- **Low · Tell: No · Effort: S** — Clicking preset caller chips (`public/app.js:369`) or `Approve` / `Mark complete` (`public/app.js:546`) neither disables the clicked button nor shows a local spinner on that card during `700ms–1,500ms` network round-trips.
- **Low · Tell: No · Effort: S** — Pastors cannot edit the auto-generated `volunteerSummary` in the UI (`public/app.js:248-251`) before clicking `Approve and assign deacon`, even though `POST /api/calls/:id/approve` supports `volunteerSummary` overrides.

### 3. Navigation, mobile, tokens, and copy
- **Medium · Tell: No · Effort: S** — At `<=640px` (`public/styles.css:1605-1607`), `.brand-name` and `.nav-links` (`How it works`, `Safeguards`, `Pastor desk`) are hidden via `display: none` with no mobile drawer, leaving an unlabelled house icon in the top-left of the landing page.
- **Low · Tell: Yes · Effort: S** — `public/styles.css` defines `14` distinct `font-size` values (including every single integer pixel from `12px` through `20px`), `11` `border-radius` values (`2px`, `3px`, `4px`, `6px`, `8px`, `10px`, `12px`, `16px`, `20px`, `50%`, `100px`), and `10` raw hex colors outside `:root`. Consolidate into `6` type-scale variables and `4` radius tokens.
- **Low · Tell: Yes · Effort: S** — Public landing page copy (`public/index.html:201,208`) surfaces developer/hackathon jargon (`"HTTP 409"`, `"Rock#7183 immunity"`) to church leaders instead of plain pastoral language (save protocol citations for `README.md` and `AUDIT.md`).

---

## What reads as AI-generated

Most classic vibe-code tells were already removed (`0` purple gradients, `0` emoji headings, `0` `TODO` placeholders, `0` banned marketing buzzwords, `0` unused npm packages, and `99.4%` CSS selector utilization). A senior reviewer looking closely would still notice four subtle tells:

1. **Prompt/rubric terminology leaking into user-facing copy and comments (Perception only):** `public/index.html:201,208` mentions `(HTTP 409)` and `Rock#7183 immunity` on a church marketing page, and top-of-file comments (`src/core/triage.mjs:1`, `src/core/rbac.mjs:1`) quote `Supreme Architectural Boundary` verbatim from `AGENTS.md`.
2. **Every integer pixel font size from `12px` to `20px` in `public/styles.css` (Perception / maintainability):** Having `12px`, `13px`, `14px`, `15px`, `16px`, `17px`, `18px`, `19px`, and `20px` simultaneously is a classic multi-pass AI styling fingerprint where each component chose a local size rather than referencing `--text-sm` / `--text-base` / `--text-lg`.
3. **Silent `catch {}` blocks + unlogged `500` handler (Carries operational risk):** Five empty `catch` blocks (`triage.mjs:229,252,279`, `store.mjs:150,223`) plus `server.mjs:428` returning `"Internal server error."` without `console.error` reflect defensive "never crash the demo" generation that hides broken production keys.
4. **Backend endpoints/params with no UI caller (Perception):** `GET /api/audit` (`src/server.mjs:409`) and `body.volunteerSummary` override (`src/server.mjs:377`) are implemented and tested on the server, but never wired into `public/app.js`.

---

## Already at senior level

Do **not** rewrite or over-complicate these parts; they are genuinely strong:

- **Physical server-side RBAC projection (`src/core/rbac.mjs:25-72`):** Instead of hiding sensitive fields in CSS or frontend state, `projectCallForRole` constructs a narrow allowlist object for `volunteer` and defaults fail-closed when `x-bethany-role` is omitted (`test/backend.test.mjs:209-222`).
- **Deterministic safety boundary before LLM execution (`src/core/triage.mjs:406-431`):** `detectCrisis()` runs first; when triggered, `tryAiStructuredExtract()` is skipped completely (`aiCounselingBlocked: true`) and `store.approveCall()` enforces HTTP `409` on both `urgent` and `prayer` categories (`src/core/store.mjs:368-378`).
- **Transactional SQLite schema + `Rock#7183` guard (`src/core/store.mjs:81-132,163-213,338-361`):** Real `CHECK` constraints, `BEGIN IMMEDIATE` / `ROLLBACK` around snapshot imports, and strict `callerId` filtering tested against corrupted data (`test/backend.test.mjs:462-497`).
- **Zero-dependency runtime & fast real-server test suite (`package.json`, `test/backend.test.mjs`):** `0` external npm packages, HTTP `206` / `416` + `HEAD` audio streaming, OWASP CSV formula neutralization (`src/core/exportCsv.mjs:3-13`), and `22` integration tests running in `2.1s`.
- **Editorial restraint and layout rhythm (`public/index.html`, `public/phone.html`, `public/styles.css`):** Separating `/` from `/phone`, using open-ground hairline ledgers instead of SaaS stat-card soup, and tuning `1440px` / `1280px` / `390px` viewports with `0px` horizontal overflow.

---

## Not checked

- **Real telephone call through Twilio PSTN:** `POST /api/twiml` was verified via HTTP integration tests and `curl`, not by dialing a provisioned Twilio phone number from a physical landline or rotary handset.
- **Screen-reader live traversal (NVDA / VoiceOver):** Accessibility findings come from HTML/CSS/JS semantic inspection and contrast math rather than an interactive NVDA or iOS VoiceOver session.
- **Load / concurrency stress testing:** Not run against the live Vercel deployment to avoid mutating shared demo state or burning free-tier Groq quota.
- **Perceptual audio QA via `earshot`:** `earshot` CLI is not installed on this Windows machine; Pastor David's WAV was verified via PCM sample measurements (`36.59s`, `-18.73 dBFS` RMS, `-1.50 dBFS` peak, `0` clipped samples).

## Re-audit when

1. Before onboarding the first real congregation or storing any real person's phone number, voice recording, or health need (must verify real session auth, tenant RLS, encrypted audio/DB retention, and live Twilio `<Record>` + SMS alerts).
2. After closing the **Fix first** items above to confirm live Vercel `/api/transcribe` (`200 OK`), Upstash persistence (`persistenceMode: "upstash_redis"`), and ARIA `tablist` + contrast updates.
