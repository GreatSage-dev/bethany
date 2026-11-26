# Bethany — Design Direction (`docs/DESIGN_DIRECTION.md`)

**Reference Extracted Live (`reverse-engineering-saas/tokens.js`):** `https://austinstone.org/` (1440×900 Playwright audit)
**Craft Drivers (`UI_CRAFT_WORKFLOW.md`):** `unslop` (9-pass visual clarity) + `emil-design-eng` (tactile micro-physics, `cubic-bezier(0.23, 1, 0.32, 1)`, `scale(0.97)` press) + `brand-mark` (monochrome geometric SVG)

## 5-Line Unslop Direction
- **Product:** Church audio and deacon care over plain landlines for homebound, elderly, and low-vision members.
- **Character:** Calm, dignified, neighborly, exact.
- **World:** A sunlit Sunday parlor and church sanctuary desk—warm editorial photography, crisp white bulletin paper, deep charcoal ink, and a tactile ivory landline handset.
- **Moments:** (1) Full-bleed documentary hero photography with a live bottom-right "Listen on Any Phone" Pastor David audio player; (2) An interactive tactile Touch-Tone landline handset paired with a 1px hairline Deacon Care Ledger and live `Pastor / Volunteer` privacy diff.
- **Signature:** Crisp `100px` monochrome pill actions paired with `tabular-nums` landline dial digits (`1`, `2`, `0`) and a quiet `#3C4331` olive-moss pastoral status strip.

## Computed Tokens (Extracted from `austinstone.org` + Calibrated for Bethany)
- **Grounds:** `--bg-canvas: #FFFFFF` · `--bg-subtle: #F4F4F4` · `--bg-ink: #282828` · `--bg-ink-elevated: #3E3E3E`
- **Text Roles:** `--text-primary: #282828` · `--text-secondary: #5E5E5E` · `--text-muted: #898989` · `--text-on-dark: rgba(255, 255, 255, 0.92)`
- **Borders:** `--border-hairline: rgba(148, 151, 158, 0.22)` (`--pinstripe` rule, zero heavy box shadows)
- **Accents (≤5% viewport):** `--accent-olive: #3C4331` (pastoral sanctuary olive-moss) · `--accent-slate: #487A7C` (care/approved) · `--accent-crisis: #C43B46` (urgent deterministic crisis alert ONLY)
- **Typography:** Display & UI `Plus Jakarta Sans` (400, 500, 600 — free twin to Austin Stone's Proxima Nova; zero 700–900 shouting except hero `112px/1.08` tight `-0.02em`), Data/Phone/Timers `JetBrains Mono` with `font-variant-numeric: tabular-nums`. Sentence case across interface labels; no emojis, no gradient text, no neon glows.
- **Radii & Spacing:** `4px` scale (`12px`, `16px`, `24px`, `32px`, `72px`, `120px` section rhythm). Pills `100px` for primary CTAs (`1` filled `#282828` + `1` outline hairline per view); controls `8px`; panels `12px–16px`.

## Composition Rhythm (Anti-Box-Soup Architecture)
1. **Full-Bleed Documentary Hero (`100svh`):** Edge-to-edge warm editorial photograph (`public/images/hero-bethany-home.jpg`), crisp white display headline on the calm dark-warm left pocket, 1 filled white pill + 1 hairline outline pill, and Austin Stone's signature bottom-right live audio tile (`Listen: Pastor David's Sunday Word`).
2. **Open-Ground Editorial Statement + Documentary Story Split (`#FFFFFF`):** `48px/57.6px` charcoal statement on pure open white ground (`120px` vertical breathing room) paired with our bespoke candid documentary pastor photograph (`public/images/story-pastor-recording.jpg`)—zero borders, zero card frames.
3. **One Wide Live Interactive Proof Stage (`#F4F4F4` — `/judge` & inline):** Tactile ivory/charcoal Touch-Tone Handset (`Dial 1 / 2 / 0`, real WebAudio DTMF tones, live microphone via Groq Whisper) opposite the live `1px` hairline Deacon Care Ledger (`Pastor / Volunteer` server-side RBAC Role Switcher, PII redaction diff, 1-click Genesis ChMS & Planning Center CSV export).
4. **Sticky Hairline Trust Ledger (`#FFFFFF`):** `5fr` sticky heading left, `6fr` numbered `01 / 02 / 03` safeguards right (zero AI preaching, deterministic Barna crisis gate, `Rock#7183` server-side RBAC).
5. **Quiet `#3C4331` Olive-Moss Bottom Ribbon:** Austin Stone-inspired grounding bar with quick jump to the live zero-signup phone console.
