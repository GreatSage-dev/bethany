# Bethany — Engineering Guardrails (`AGENTS.md`)

**Mission:** Church that comes home — church AI over plain landlines (`Outreach & Evangelism` · AI for Church Hackathon 2026).
**Deadline:** Friday, Nov 27, 2026 at 11:59 PM ET · **Code Freeze:** Friday, Nov 27 at 4:30 PM ET.

## Hard Invariants (Never Violate)
1. **Supreme Architectural Boundary:** AI only transcribes/structures messy caller voice notes. Plain deterministic code owns crisis escalation (`src/core/triage.mjs`), server-side RBAC/PII redaction (`src/core/rbac.mjs`), IVR state routing (`src/core/ivr.mjs`), and human pastor sign-off (`uiOnly: true`).
2. **Zero AI Preaching or Counseling:** Pressing `1` plays the church's recorded human pastor audio. Urgent self-harm, abuse, medical, or acute spiritual distress triggers immediate human escalation + 988/911 notice with **0** AI counseling output.
3. **Zero Real PII (Rule #5):** All seeded congregation data (*Grace Harbor Church*) is 100% synthetic.
4. **Server-Side RBAC (`Rock#7183` + `CVE-2025-48757` immunity):** Volunteer API payloads physically exclude `rawTranscript`, `callerPhone`, `medicalFlags`, `redactedItems`, and unapproved/crisis records. Unknown `callerId` queries return `[]`, never all records.
5. **Vercel & Ponytail Discipline:** Never write inside `/var/task` on Vercel (use Upstash Redis REST when configured, `/tmp/bethany.db` fallback on Vercel, `data/bethany.db` locally). Zero unnecessary dependencies, every shortcut documented as `shortcut: <limit>, <when to upgrade>`, and every non-trivial module backed by deterministic tests (`npm run verify` exits `0`).
