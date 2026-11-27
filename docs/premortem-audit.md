# Premortem Product Audit: Bethany

- **Audit mode:** Existing MVP / Prototype (`v0.1.0`, deployed at `https://bethany-sigma.vercel.app`, repository `GreatSage-dev/bethany`)
- **Decisions informed:**
  1. **Immediate commitment (Today, Nov 27, 2026 before 11:59 PM ET):** What must be fixed or left untouched in the final hours before submitting to the *AI for Church Hackathon 2026* (`Outreach & Evangelism` track) and recording the 60 to 90 second demo video.
  2. **Post-hackathon commitment (Next 30 to 90 days, provisional):** Whether to invest engineering and outreach time turning Bethany into a live pilot for real congregations, and what must be validated first.

---

## Verdict and decision

**Verdict:** **Direction supported for the hackathon wedge; specific execution bottlenecks and a last-mile workflow gap must be resolved before any real church pilot.**

- **For today's hackathon submission (High confidence on technical & demo readiness):** Bethany has a sharp, memorable audience wedge (the only non-screen landline tool among 34 browser/app entries), grounded pastoral ethics (zero AI preaching or crisis counseling), and a verifiable server-side privacy boundary. However, **one evidenced live deployment defect (`F1`)**—an invalid `GROQ_API_KEY` on Vercel causing **Record mic** to fail with `HTTP 401` while the UI header claims Groq is live, paired with ephemeral `/tmp` storage—can directly hurt live judging today and takes under 5 minutes to fix.
- **For a real congregation pilot (Moderate confidence on problem, Low/Unvalidated confidence on live adoption & willingness to pay):** Imagining a 90-day pilot failure reveals four concrete breaks between Bethany's landing-page promise and its current implementation: real Twilio `<Record>` voicemails are silently dropped (`F2`), no outbound alert reaches pastors or deacons when urgent or errand calls arrive (`F2`), volunteer privacy redaction strips the caller's address and phone number even *after* a named deacon is assigned to deliver their prescription (`F3`), and pastors have no way to upload or sync next Sunday's sermon without a code deploy (`F4`). Beyond code, actual senior dial-in behavior (`F5`) and church budget willingness to pay over existing dial-a-sermon tools (`F6`) remain untested (`Unknown`).

---

## Product thesis

> For **homebound seniors, nursing-home residents, and blind or low-vision church members** (`beneficiary`), **requiring smartphones, QR codes, or web portals for church connection and mid-week help** causes **isolation from Sunday teaching and unreported practical needs (rides, prescriptions, visits)**. Bethany aims to deliver **weekly pastoral voice connection and privacy-safe deacon care** through **a single church landline number (`Press 1` recorded pastor audio, `Press 2` AI-structured + deterministically redacted voicemail intake, `Press 0` human crisis escalation) exporting into existing ChMS tools**. **Church care pastors or church boards** (`buyer / approver`) would pay (or fund `<$10–$39/mo`) because **it keeps vulnerable members connected without forcing staff to migrate off Planning Center or Genesis ChMS or exposing sensitive medical confessions to general volunteer drivers**.

### Four-layer comparison

| Layer | Assessment | Summary |
| --- | --- | --- |
| **1. Promise** | Clear & differentiated (`Observed` in `README.md`, `public/index.html`) | One landline number for any rotary or push-button phone; churches upload their pastor's voice; AI structures voicemails; deterministic code masks PII and escalates crises; `<$10/mo` with ChMS CSV export. |
| **2. Implementation** | Strong web sandbox; incomplete PSTN & weekly ops loop (`Observed` in `src/`) | Browser handset (`/phone`), WAV streaming, regex crisis gate, server-side RBAC, and CSV export work end to end. However, real Twilio `<Record>` drops voicemails, pastor sermon upload does not exist, outbound SMS/call notifications do not exist, and live Vercel STT currently `401`s. |
| **3. Experience** | Unobserved with real seniors or pastors (`Unknown`) | Tested only with synthetic *Grace Harbor Church* fixtures (`Rule 5`). No observation yet of an 80-year-old caller dialing in unassisted or a real deacon completing a delivery from the redacted card. |
| **4. Commercial result** | Pre-launch / unvalidated (`Unknown`) | Zero churches pitched, onboarded, or billed yet; `<$10/mo` operating cost claim in `public/index.html:216` is an unverified infrastructure estimate rather than observed unit economics. |

### Representative core workflow trace (Homebound Errand: Caller -> Pastor -> Deacon Delivery)

| Step | Source / inspected behavior | Limit or missing evidence | Consequence if gap holds |
| --- | --- | --- | --- |
| **1. Dial church number** | Browser keypad (`public/phone.html:102`) & `POST /api/twiml` (`src/server.mjs:261`) play menu (`1`, `2`, `0`). | No provisioned Twilio phone number inspected; `<Gather>` defaults to DTMF only (`src/core/ivr.mjs:142`). | Pulse-dial rotary callers promised in copy (`index.html:145`) time out after 8s and get hung up on. |
| **2. Leave voicemail (`Press 2`)** | Web presets/text (`POST /api/calls`) work; browser mic (`POST /api/transcribe`) calls Groq Whisper. On Twilio (`ivr.mjs:124`), `<Record action="/api/twiml?step=recorded" transcribe="true" />` runs. | Live Vercel `/api/transcribe` returns `502 (HTTP 401)` (`E3`). Twilio `<Record action>` does not include `TranscriptionText`, so `server.mjs:280` skips `createCall` while saying *"message received"* (`E5`). | Live judge mic test fails today; real landline callers believe the church heard them while their request is silently lost. |
| **3. Triage & PII redaction** | `analyzeCallMessage` (`src/core/triage.mjs:399`) runs `detectCrisis` first, then Groq/Gemini/local extraction + regex `findSensitiveSpans` and `scrubTextForVolunteer`. | Regex redactor misses lowercase `"dr patel"` and unlisted meds/rooms (`E6`). | Uncommon medical terms or room numbers can leak into `volunteerSummary` unless caught by pastor. |
| **4. Pastor notification & review** | Call sits in SQLite (`pending_review` or `urgent_escalation`) until pastor opens `/phone` (`Pastor view`) and clicks `Approve and assign deacon` (`public/app.js:265`). | Zero SMS, email, or `<Dial>` call notifies the on-call pastor (`src/server.mjs:302-311`); pastor cannot edit `volunteerSummary` in UI (`app.js:248`). | `Press 0` crisis callers wait for an ”immediate callback” (`ivr.mjs:80`) that nobody was paged about. |
| **5. Persistence across sessions** | `BethanyStore` (`src/core/store.mjs:18-20`) writes `/tmp/bethany.db` on Vercel unless Upstash env vars are set. | Live `/api/health` shows `vercel_tmp_ephemeral` (`E3`). | Approved errands vanish after Vercel serverless cold start (~5–15 min idle). |
| **6. Deacon last-mile delivery** | Volunteer switches to `Volunteer view` (`app.js:217-237`), seeing `"Martha V. · Pharmacy pickup at Oak Street Pharmacy · Friday at 2 PM"` with phone and home address stripped (`rbac.mjs:61-71`). | Assigned deacon receives no push/SMS and has **no drop-off address or phone number** for Martha (`E7`). | Assigned deacon cannot actually bring the prescription to Martha's house without texting the pastor offline. |
| **7. Repeat next Sunday** | `GET /api/sermon/audio` streams static `data/pastor-sunday-recap.wav` bundled in `vercel.json:8`. | No admin sermon upload, phone-in recording, or podcast RSS feed sync exists (`E8`). | Church stops using Bethany in Week 2 because updating Sunday's audio requires a developer git push. |

---

## Evidence coverage

### Evidence ledger

| ID | Source | Status | What it establishes | What it does not establish |
| --- | --- | --- | --- | --- |
| `E1` | `README.md:10` & prior hackathon gallery scan (`34` entries) | Observed (repo text) / Reported | Positioning claim that peer hackathon apps require screens/smartphones. | Whether churches outside the hackathon lack non-AI phone alternatives. |
| `E2` | `README.md:66`, `public/index.html:193` (Barna & Gloo Oct 2026 citation) | Reported (secondary citation in repo) | Pastors express high concern over AI Scripture error (`94%`) and crisis handoff (`71%–94%`). | That pastors will adopt or pay for Bethany specifically. |
| `E3` | Live probes `GET /api/health` & `POST /api/transcribe` on `bethany-sigma.vercel.app` (2026-11-27) | Observed (runtime) | Production reports `aiMode: "groq_free_tier"` and `persistenceMode: "vercel_tmp_ephemeral"`, while `/api/transcribe` fails with `502 (upstream HTTP 401)`. | Whether Groq latency/accuracy satisfies real elderly speech accents once key is fixed. |
| `E4` | `npm test` (`test/backend.test.mjs`, `22/22` pass) | Observed (local Node `v24.18.0`) | Tested RBAC, crisis regex, CSV sanitization, Range/HEAD audio, and Upstash mock behavior pass locally. | Frontend browser behavior, real Twilio PSTN behavior, or real user comprehension. |
| `E5` | `src/core/ivr.mjs:118-128` & `src/server.mjs:277-298` | Observed (code) | `<Record action>` lacks `transcribeCallback` and `server.mjs` ignores `RecordingUrl`, returning success TwiML when `TranscriptionText` is empty. | How Twilio behaves once `transcribeCallback` or `RecordingUrl` fetch is wired. |
| `E6` | `src/core/triage.mjs:42-50,109-119` | Observed (code) | PII redaction relies on 6 regex patterns (`ADDRESS_RE`, `DOCTOR_RE` case-sensitive, 44-word `MEDICAL_RE`). | False-negative rate on real elderly voicemails (`Unknown`). |
| `E7` | `src/core/rbac.mjs:54-72` & `public/app.js:217-237` | Observed (code) | All `volunteer` responses omit `callerName`, `callerPhone`, and street addresses, with no separate view for the *assigned* deacon. | How a specific church prefers to share member addresses with vetted deacons (`Unknown`). |
| `E8` | `vercel.json:6-10`, `src/core/store.mjs:245-284`, `src/server.mjs` | Observed (code) | Sermon audio is a static file bundled at deploy time with no upload or RSS ingestion route. | Effort required for church staff to upload audio weekly (`Unknown`). |
| `E9` | `public/index.html:216` (`"under $10 a month to run"`) | Reported (copy claim) | Author's target infrastructure cost framing (`$1.15/mo` Twilio number + per-minute voice + free Groq/Vercel). | Actual church willingness to pay, support labor cost, or margin at scale (`Unknown`). |

### Full-cycle screening

| Area | Coverage | Notes |
| --- | --- | --- |
| 1. Intended market & buying roles | Inspected (thesis) / Unknown (buyer interviews) | Beneficiary (homebound senior), operator (care pastor/deacon), and buyer (church leadership) are distinct. |
| 2. Problem, trigger & consequence | Reported (`E2`) / Unknown (direct church interviews) | Homebound isolation and pastoral distrust of AI counseling are plausible and well-anchored; congregation-level frequency is unmeasured here. |
| 3. Alternatives & switching | Inferred | Churches currently use manual phone trees, church office voicemail, free conference lines, or RSS dial-in services (such as Sermon-by-Phone). |
| 4. Solution fit & mechanism | Inspected (`E4–E8`) | Strong ethical split (human audio + deterministic safety), but real PSTN recording, urgent paging, and assigned-deacon address handoff have implementation breaks. |
| 5. Delivered value & first outcome | Observed (demo sandbox) / Unknown (real callers) | Judge can experience the simulated flow in `<30s` on `/phone`; zero real congregation calls completed yet. |
| 6. Willingness to pay | Unknown | No offers, pilots, or pricing conversations conducted yet. |
| 7. Build direction & scope | Inspected (`docs/PLAN.md`) | Disciplined scope cuts protected the demo core; post-hackathon work must shift from UI polish to PSTN/ops plumbing. |
| 8. Experience, reliability & trust | Inspected (`E3–E6`) | Live Vercel `401` mic failure and silent Twilio `<Record>` drop threaten trust if triggered. |
| 9. Positioning & acquisition | Inspected (`public/index.html`, `README.md`) | Clear Austin Stone-style pastoral tone; minor developer jargon (`HTTP 409`, `Rock#7183`) on landing page. |
| 10. Pricing & delivery economics | Unknown | Twilio voice + transcription per-minute pass-through vs. flat church SaaS tier not yet modeled from real call durations. |
| 11. Retention & expansion | Inspected (`E8`) / Unknown (cohorts) | Hardcoded weekly sermon WAV (`E8`) is a guaranteed Week-2 retention blocker until replaced by RSS or phone-in recording. |

---

## What holds up

1. **Sharp, defensible audience wedge (`E1`, `public/index.html:64-66`):** Targeting homebound seniors and blind/low-vision members via landlines avoids competing head-on with 30+ generic Bible study chatbots and sermon-clip generators.
2. **Code-enforced ethical boundary matching pastoral objections (`E2`, `src/core/triage.mjs:406-431`, `src/core/store.mjs:368-378`):** Pressing `1` plays a human pastor's recording, crisis keywords bypass the LLM completely (`aiCounselingBlocked: true`), and private prayers/crises return `HTTP 409` if someone tries to dispatch them to general volunteers.
3. **Zero-setup 15-second evaluator experience (`public/phone.html`, `E4`):** Judges can hear DTMF tones, stream Pastor David's Psalm 23 clip, trigger 3 contrasting caller safeguards, compare Pastor vs. Volunteer server JSON, and export Genesis/Planning Center CSVs without creating an account.

---

## Prioritized findings

### Hypothetical premortem scenarios
- **Scenario A (Tonight at 11:59 PM ET):** Bethany is well-Crafted, yet misses finalist/winner placement in `Outreach & Evangelism` because a judge hits a live error on `/phone` or spots a gap between the pitch and how the telephony webhook works.
- **Scenario B (Day 90 post-hackathon, provisional):** Bethany onboards 10 pilot churches, yet 0 congregations still receive weekly senior calls or pay by Month 3.

---

### F1. Live production microphone transcription fails (`HTTP 401`) while the UI claims Groq is live, and state resets on cold starts
- **Type and priority rationale:** **Evidenced blocker (Rank #1 — Urgent today).** Directly affects hackathon judging within hours and requires near-zero code risk to fix.
- **Failure mechanism:** Pasted `GROQ_API_KEY` in Vercel fails Groq authentication (`401`) while `/api/health` checks prefix format only -> `/phone` header displays `"Groq Whisper + LLM live"` -> a judge clicks **Record mic**, speaks a test prayer, and hits a `502` error banner; separately, `vercel_tmp_ephemeral` loses approved calls after idle cold starts.
- **Evidence and status:** **Observed** (`E3`: live `POST https://bethany-sigma.vercel.app/api/transcribe` returned `502 (upstream HTTP 401)` on 2026-11-27; live `GET /api/health` returned `persistenceMode: "vercel_tmp_ephemeral"`; local `.env` `56`-char key succeeded with `200 OK`).
- **Counterevidence / alternative:** Most judges may click the 3 prominent sample caller cards (`Martha`, `Arthur`, `Evelyn`) rather than opening the collapsed `<details>` mic drawer (`public/phone.html:158`), in which case deterministic fallback still works cleanly. Even so, one curious technical judge clicking **Record mic** sees an avoidable failure.
- **Customer and commercial consequence:** Immediate credibility loss during live judging ("the AI part of the AI hackathon entry threw a 401").
- **Correction or test:** Paste the verified 56-character `GROQ_API_KEY` into Vercel Environment Variables, optionally connect free Upstash Redis in Vercel Storage, redeploy, and run `POST https://bethany-sigma.vercel.app/api/transcribe` (limit: 5 minutes).
- **Decision condition (Provisional):** **Ready to film & submit** when live `POST /api/transcribe` returns `200` (`provider: "groq_whisper"`) and `/api/health` reports `persistenceMode: "upstash_redis"` (or, if skipping Groq on purpose, remove `GROQ_API_KEY` in Vercel so the UI honestly displays `"Deterministic local engine"`).

### F2. Real landline voicemails (`Press 2`) are silently dropped and urgent callbacks (`Press 0`) trigger zero outbound alerts
- **Type and priority rationale:** **Evidenced blocker for any real phone pilot (Rank #2); Material risk if dialing a live Twilio number in the demo.**
- **Failure mechanism:** Caller dials a real Twilio number and presses `2` -> `<Record action="/api/twiml?step=recorded" transcribe="true" />` (`ivr.mjs:124`) posts `RecordingUrl` without `TranscriptionText` -> `server.mjs:280` skips `store.createCall()` and plays *"Thank you. Your message has been received"* -> request vanishes. Similarly, pressing `0` (`ivr.mjs:80`) tells a distressed caller *"We have alerted the on-call pastor"*, but `server.mjs:302-311` only inserts a SQLite row with no `<Dial>` transfer or SMS page.
- **Evidence and status:** **Observed** in `src/core/ivr.mjs:79-85,118-128` and `src/server.mjs:277-311` (`E5`), cross-checked against Twilio Programmable Voice `<Record>` webhook behavior.
- **Counterevidence / alternative:** For today's browser-only `/phone` demo (`POST /api/simulate/dtmf` + `POST /api/calls`), this code path is not exercised; `docs/PLAN.md:28` explicitly listed live Twilio number provisioning as Cut #1 if behind.
- **Customer and commercial consequence:** Catastrophic trust and safety failure in a real church pilot: homebound seniors think the church ignored their prescription need, and crisis callers are promised an immediate callback nobody was paged to make.
- **Correction or test:** Before connecting any real phone number (or if demoing a live call), fetch `RecordingUrl` into `transcribeAudioBuffer()` (or add `transcribeCallback`) and add `<Dial>+1...</Dial>` + Twilio SMS alert to the on-call pastor on `urgent_escalation` (limit: 2 hours before pilot).
- **Decision condition (Provisional):** **Block any live church phone test** until 3 consecutive real phone calls (`Press 1`, `Press 2` spoken need, `Press 0` urgent) persist in the queue and trigger an observable SMS/ring on the pastor's phone within 15 seconds.

### F3. The "Last-Mile Deacon Paradox": stripping both address and phone number prevents the assigned volunteer from completing the errand
- **Type and priority rationale:** **Material risk to core workflow value (Rank #3 — Post-hackathon product architecture).**
- **Failure mechanism:** To protect privacy on an open volunteer board, `projectCallForRole` (`rbac.mjs:61-71`) removes `callerPhone` and `scrubTextForVolunteer` (`triage.mjs:111`) replaces `418 Sycamore Lane` with `[address withheld]` -> Pastor assigns `Deacon Thomas Reid` -> Deacon Thomas opens Volunteer view (`app.js:219-236`) and sees `"Martha V. · Pharmacy pickup at Oak Street Pharmacy · Friday at 2 PM"` with zero drop-off address and zero phone number -> Thomas has to call or text Pastor David manually to get Martha's contact details anyway.
- **Evidence and status:** **Observed** in `src/core/rbac.mjs:54-72`, `src/core/triage.mjs:109-119`, and `public/app.js:217-237` (`E7`); **Inferred** operational consequence on delivery handoff.
- **Counterevidence / alternative:** In small churches (`<150` members), ordained deacons (`Deacon Thomas Reid`) often already know `Martha V.` personally or look up her address in their Planning Center People directory (`exportCsv.mjs`), whereas medical details (`lisinopril`, `surgery`) genuinely never need to travel to the deacon.
- **Customer and commercial consequence:** If volunteers must still message the pastor for every address and phone number, Bethany automates intake while leaving coordination friction intact, weakening repeat pastor usage.
- **Correction or test:** Separate **3 tiers of visibility** instead of 2 before pilot: (1) *Open Volunteer Pool* (`Martha V. · Oak Street Pharmacy · neighborhood only, 0 PII`), (2) *Assigned Vetted Deacon* (receives logistics-only SMS/card with drop-off address + phone number, **still zero medical/spiritual transcript**), and (3) *Pastor/Elder* (full pastoral context). Interview 3 church care coordinators (`<=1 week`) to verify whether deacons look up addresses in ChMS or expect them in the dispatch SMS.
- **Decision condition (Provisional):** **Adopt 3-tier logistics handoff** if `>=2 of 3` interviewed care coordinators say volunteers do not have ChMS directory access on the road.

### F4. Weekly sermon updates require a developer redeploy, whereas incumbent dial-in services auto-sync church RSS feeds
- **Type and priority rationale:** **Evidenced blocker for Week-2 retention (Rank #4 — Post-hackathon).**
- **Failure mechanism:** `GET /api/sermon/audio` serves static `data/pastor-sunday-recap.wav` bundled at deploy time (`vercel.json:8`) -> Monday morning arrives -> church secretary or pastor has no UI upload button, phone-in recording PIN, or podcast/YouTube RSS URL setting -> line plays last week's Psalm 23 clip indefinitely -> seniors stop calling `Press 1`.
- **Evidence and status:** **Observed** in `vercel.json:8`, `src/server.mjs:229-231`, `public/index.html:101` (`E8`). Incumbent existence (`Sermon-by-Phone`, `AudioNow`) is **Inferred** from established church telecom category norms.
- **Counterevidence / alternative:** Correctly cut during the 48-hour hackathon (`docs/PLAN.md:29`, Cut #2).
- **Customer and commercial consequence:** Zero Week-2 retention in real congregations if publishing Sunday's 3-minute recap takes more than 60 seconds for a non-technical pastor.
- **Correction or test:** Before pilot, add **two zero-IT ingestion paths**: (A) paste church podcast RSS URL (auto-plays latest `<enclosure>` `.mp3`), OR (B) pastor dials the church number, enters a 4-digit Pastor PIN (`*9`), and records a 3-minute recap straight from their own phone (`<=1 day` build).
- **Decision condition (Provisional):** **Pilot-ready** when a non-technical pastor can update Sunday's audio in `<2 minutes` by phone or RSS with zero web file conversions.

### F5. Unvalidated assumption that homebound seniors will dial a new phone number and navigate keypad prompts (plus rotary pulse incompatibility)
- **Type and priority rationale:** **Validation gap (Rank #5 — Customer behavior).**
- **Failure mechanism:** Seniors with mild cognitive decline, hearing loss, or pulse-dial rotary phones either (a) keep calling the main church office number they already know instead of learning a new Bethany number, (b) hang up when hearing a synthetic TTS menu (`Polly.Joanna` in `ivr.mjs:102`), or (c) fail DTMF detection on true rotary phones (`ivr.mjs:142`).
- **Evidence and status:** `Polly.Joanna` menu voice and DTMF-only `<Gather>` are **Observed** in `src/core/ivr.mjs:102,142`; actual senior caller completion rate is **Unknown** (`0` senior test calls observed).
- **Counterevidence / alternative:** Seniors routinely navigate pharmacy refill lines (`Press 1 / Press 2`), and churches can forward option `3` of their *existing* church phone number to Bethany so members never have to learn a new number. Also, replacing `Polly.Joanna` menu prompts with the pastor's own recorded greeting ("Hi, it's Pastor David—press 1...") removes robotic hang-ups.
- **Customer and commercial consequence:** High church churn if churches pay monthly but `<5` homebound calls arrive per month.
- **Correction or test:** Run a concierge test with **1 local church and 5 homebound seniors** over 2 Sundays using the pastor's real voice for the menu greeting + `<Gather input="dtmf speech">` (so rotary callers can simply *say* "one" or "two" aloud!), measuring call completion without family coaching (boundary: 2 weeks, `<$15` Twilio cost).
- **Decision condition (Provisional):** **Continue premise** if `>=3 of 5` seniors complete `Press 1` or `Press 2` unassisted and at least `2` call back the following Sunday; **revise to outbound scheduled call ("Bethany rings their landline at 11 AM Sunday")** if inbound dialing adoption is low! *(Note how powerful that pivot is: if seniors forget to dial in, outbound Sunday auto-call makes adoption effortless.)*

### F6. Unvalidated buyer, budget, and `<$10/mo` unit economics in small-to-midsize churches
- **Type and priority rationale:** **Validation gap (Rank #6 — Commercial model).**
- **Failure mechanism:** Small churches (`<150` members, tight budgets) love the mission in conversation, yet rely on unpaid deacons calling 6 shut-ins manually for `$0/mo`, while larger churches (`500+` members) require native Planning Center API OAuth + custom caller ID + BAA-grade privacy guarantees rather than `$10/mo` CSV downloads.
- **Evidence and status:** **Unknown** (`0` buyer conversations or paid pilots recorded); `<$10/mo` copy (`public/index.html:216`, `E9`) is an unverified raw-API cost estimate that excludes founder setup/support labor.
- **Counterevidence / alternative:** Churches routinely spend `$29–$99/mo` on texting/calling tools (`Text In Church`, `Sermon-by-Phone`, `Planning Center` add-ons) from benevolence or care ministry budgets without board votes when under `$50/mo`.
- **Customer and commercial consequence:** Pricing at `$9/mo` cannot fund high-touch church onboarding, while unvalidated enterprise pricing stalls adoption.
- **Correction or test:** After the hackathon, pitch a concrete `$29/mo` (*"Care Line + Weekly Pastor Recap + Deacon SMS Dispatch, we set it up with your existing church number in 15 minutes"*) pilot to **10 Care/Associate Pastors** within 14 days; count paid `$29` pilot commitments vs. specific objections.
- **Decision condition (Provisional):** **Commercial path supported** if `>=2 of 10` churches pay `$29/mo` for a 30-day pilot; **narrow to grant/denomination-sponsored ministry utility or open-source self-host** if pastors want the workflow but have zero software budget.

---

## Why it is not there yet

Bethany's **concept and hackathon demo wedge are unusually strong**, because the product solves an immediate moral and practical tension pastors care about (reaching offline seniors without letting AI preach or leak private confessions). Where Bethany falls short today splits cleanly across two horizons:

1. **Today's Hackathon Horizon (5 hours to Code Freeze):** Everything works locally, and the visual/architectural story is cohesive, except **one live production mismatch (`F1`)**—Vercel's `GROQ_API_KEY` returning `401` while the UI banner claims Groq is live, plus ephemeral `/tmp` storage.
2. **Real Congregation Horizon (Post-Hackathon):** Bethany currently stops at the **pastor's browser screen** rather than completing the **real-world telephony and delivery loop** (`F2` silent Twilio `<Record>` drop + missing pastor/deacon SMS alerts, `F3` assigned deacon missing drop-off address/phone, and `F4` static sermon WAV). The strongest rival explanation to "churches need inbound AI voicemail triage" is that **homebound seniors prefer receiving an outbound scheduled Sunday phone call from their church rather than remembering to dial in (`F5`)**—a distinction only a 2-week 5-senior church pilot can resolve.

---

## Next actions

Ordered strictly to protect today's **Friday, Nov 27, 11:59 PM ET** hackathon deadline (`Final 20% = Survival` — do not destabilize working code with large refactors today):

| Order | Horizon | Action | Addresses | Observable output | Boundary |
| --- | --- | --- | --- | --- | --- |
| **1** | **Today (Now)** | Re-paste the working 56-char `GROQ_API_KEY` in Vercel, optionally attach free Upstash Redis in Vercel Storage, and redeploy. | `F1` | `POST /api/transcribe` returns `200` on `bethany-sigma.vercel.app`; `/api/health` shows `upstash_redis`. | `5 minutes` (zero code risk) |
| **2** | **Today (Optional polish only if desired)** | Do **at most** tiny low-risk fixes (`console.error` on 500s, contrast bump on `--text-muted` / `.audio-card-note`, ARIA `tabpanel`, accurate rotary copy -> *"push-button or voice-enabled landline"*). Skip big refactors before submission. | `F1`, `F5` & Senior Gap Audit | `npm run verify` exits `0` (`22/22`); live URL smoke-tested. | `<=20 minutes` max |
| **3** | **Today (Main priority)** | Produce the 60 to 90 second Remotion demo video showing the 50/50 loop: `Press 1` Pastor David voiceover -> `Martha` PII redaction + 1-click Pastor approval + Volunteer server JSON proof -> `Evelyn` deterministic crisis gate, and submit on `aiforchurch.com/hackathon`. | Hackathon Milestone | Exported `1920x1080` `.mp4` (`-14 LUFS`) + submitted portal receipt. | Before `11:59 PM ET` today |
| **4** | **Post-Hackathon (Week 1)** | Fix Twilio `<Record>` (`RecordingUrl` -> `transcribeAudioBuffer` + `<Gather input="dtmf speech">`), add pastor/deacon SMS alerts, add 3-tier assigned-deacon logistics view, and add Pastor PIN phone-in sermon recording / RSS sync. | `F2`, `F3`, `F4`, `F5` | Real landline call end-to-end test passes on a `$1` Twilio number. | `2–3 days` before any real church trial |
| **5** | **Post-Hackathon (Weeks 2–3)** | Run a 2-week concierge pilot with 1 local church (5 homebound seniors) and pitch a `$29/mo` setup offer to 10 care pastors. | `F5`, `F6` | Observed unassisted senior call completion + paid pilot commitments. | `14 days`, `<$25` telecom spend |

---

## Decision gates

| Next commitment | Gate type | Evidence needed | Continue if (Provisional) | Change / stop / inconclusive if |
| --- | --- | --- | --- | --- |
| **Submit & freeze for AI for Church Hackathon (Today)** | Technical Demo Gate | Live `curl` probes on `bethany-sigma.vercel.app` (`/`, `/phone`, `/api/sermon/audio`, `/api/transcribe`, `/api/calls`) + verified Remotion `.mp4`. | All routes return `200`/`206` and video shows live software within 3 seconds. | If Vercel `GROQ_API_KEY` stays `401`, delete the env var in Vercel so `/phone` cleanly runs & labels `"Deterministic local engine"` rather than erroring on mic click. |
| **Onboard 1st real congregation pilot** | Technical Safety & Workflow Gate | Auth session + RLS replacing `x-bethany-role`, plus 3 live PSTN test calls (`1`, `2`, `0`) on a real Twilio number. | `3/3` calls persist, urgent `0` rings/texts on-call pastor in `<15s`, and pastor updates Sunday audio in `<2 min`. | **Hold pilot** if any voicemail drops silently or raw transcripts remain reachable without authentication. |
| **Build multi-church SaaS billing & self-serve onboarding** | Customer Value & Commercial Gate | 2-week 5-senior pilot + 10 care-pastor `$29/mo` offer conversations. | `>=3/5` seniors complete calls unassisted AND `>=2/10` churches commit `$29/mo`. | If seniors don't dial in -> **pivot to outbound scheduled Sunday landline ring**; if `<2/10` churches have budget -> **package as denomination/grant-funded or open-source church tool**; inconclusive if `<5` pastors reached in 14 days. |
