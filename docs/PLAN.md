# Bethany Sprint Plan and Cut Order (`docs/PLAN.md`)

- **Event:** AI for Church Hackathon 2026 (`C10-B` Faith Practitioner Room)
- **Track:** Outreach and Evangelism (zero-screen outreach for homebound seniors, nursing-home residents, and blind or low-vision neighbors)
- **Hosting:** Vercel (Node 24 LTS Fluid Compute + optional free Upstash Redis via Vercel Marketplace)
- **Deadline:** Friday, Nov 27, 2026 at 11:59 PM ET (Code Freeze: Friday, Nov 27 at 4:30 PM ET)

## Phase 0: Backend Hardening (Complete)
- [x] Verify Node 24 built-in `node:sqlite` and zero-dependency ESM core.
- [x] Lock brand name **Bethany** ("Church that comes home.") and synthetic *Grace Harbor Church* fixtures.
- [x] Harden Vercel deployment (`api/index.mjs`, `vercel.json`, Upstash Redis REST sync, `/tmp/bethany.db` EROFS-safe fallback).
- [x] Wire free-tier AI providers (`GROQ_API_KEY` Whisper + `openai/gpt-oss-20b`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) plus deterministic local fallback.
- [x] Verify Twilio HMAC-SHA1 `X-Twilio-Signature`, deterministic crisis gate, server-side RBAC, PII redaction, and `npm run verify` (`exit 0`).

## Phase 1: Frontend Craft and Visual Diff Loop (Complete)
- [x] Extract live tokens from `austinstone.org` and lock `docs/DESIGN_DIRECTION.md`.
- [x] Lock Concept 1 (*The Open Threshold*) monogram in `public/favicon.svg` and responsive navbar.
- [x] Build landing page, live DTMF landline handset, browser mic intake, Pastor/Volunteer RBAC console, and `/judge` entry route.
- [x] Verify desktop (`1440x900`) and mobile (`390x844`) layouts in Playwright (`0` console errors, `0px` horizontal overflow).

## Phase 2: Adversarial Audit, GitHub Push, Deploy, and Video (In Progress)
- [x] Complete second-pass staff-engineer audit (`AUDIT.md`), fix 5 findings (`S1`, `S2`, `B1`, `B2`, `B3`), and add regression tests (`20/20` passing).
- [x] Write plain-English `README.md`, `LICENSE`, and `CONTRIBUTING.md` and push atomic commit history to `GreatSage-dev/bethany`.
- [ ] Deploy live to Vercel (`GROQ_API_KEY` + optional Upstash Redis) and smoke-test the live URL.
- [ ] Record 90-second demo video (`-14 LUFS`, live app in first 3 seconds) and submit on the hackathon portal.

## Explicit Cut Order If Behind
1. **Cut first:** Live Twilio US phone number provisioning (keep the real tested `/api/twiml` webhook and signature verification).
2. **Cut second:** External church podcast RSS auto-importer (keep pre-seeded pastor WAV audio stream).
3. **Cut third:** Multi-church onboarding wizard (keep zero-signup `/judge` experience).
4. **Never cut:** Audible touch-tone handset (`Dial 1` / `Dial 2` / `Dial 0`), live mic + preset callers, deterministic crisis gate, server-side `Pastor / Volunteer` RBAC JSON diff, `uiOnly: true` pastor approval, Genesis ChMS and Planning Center CSV export, Playwright visual polish, and `AUDIT.md`.
