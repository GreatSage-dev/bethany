# Contributing to Bethany

Bethany is built with plain Node 24 LTS built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:test`) and zero external npm packages so small churches can host it cheaply and audit every line.

## Local Setup

1. Install Node.js 24 or newer (`node -v`).
2. Copy `.env.example` to `.env` if you want live Groq or Gemini transcription. Leave it empty to run locally with the deterministic parser.
3. Run the verification suite before making changes:

```bash
npm run verify
npm run smoke
```

4. Start the local server:

```bash
npm start
```

Open `http://localhost:3001` (or `http://localhost:3001/judge` to jump straight to the touch-tone handset and care ledger).

## Engineering Rules

- Keep external runtime dependencies at zero unless an issue explicitly justifies adding a package.
- Never let an LLM perform crisis decisions, RBAC filtering, PII redaction, or pastor approval transitions. Keep those deterministic in `src/core/`.
- Never commit real congregation data, phone numbers, or `.env` files. All test fixtures in `src/core/fixtures.mjs` must stay synthetic.
- Add a deterministic regression test in `test/backend.test.mjs` for every bug fix or behavior change, and ensure `npm run verify` exits with code `0`.

## Good First Issues

- Add church-configurable sermon WAV upload from the pastor view (stored in Vercel Blob or S3).
- Add Spanish IVR menu prompts (`Press 9 for Spanish`) sharing the same deterministic state machine in `src/core/ivr.mjs`.
- Replace the `/judge` demo role header in `src/core/rbac.mjs` with signed HTTP-only session cookies for real church deployments.
