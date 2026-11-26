import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { exportCallsToCsv } from "../src/core/exportCsv.mjs";
import { computeTwilioSignature, renderTwiml, resolveIvrStep, verifyTwilioSignature } from "../src/core/ivr.mjs";
import { BethanyStore, resolveDefaultDbPath } from "../src/core/store.mjs";
import { analyzeCallMessage, detectCrisis, findSensitiveSpans, scrubTextForVolunteer } from "../src/core/triage.mjs";
import { createBethanyApp } from "../src/server.mjs";
import { normalizeVercelRewriteUrl } from "../api/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_PATH = path.resolve(__dirname, "..", "data", "pastor-sunday-recap.wav");

describe("Deterministic Crisis Gate & PII Redaction (triage.mjs)", () => {
  it("flags self-harm, abuse, medical emergency, and spiritual crisis deterministically", () => {
    const selfHarm = detectCrisis("I took too many pills and feel nobody would miss me.");
    assert.equal(selfHarm.isCrisis, true);
    assert.ok(selfHarm.flags.includes("self_harm"));
    assert.equal(selfHarm.aiCounselingBlocked, true);

    const medical = detectCrisis("I think I'm having a heart attack and my chest hurts.");
    assert.equal(medical.isCrisis, true);
    assert.ok(medical.flags.includes("medical_emergency"));

    const abuse = detectCrisis("I am unsafe at home, he threw me against the wall.");
    assert.equal(abuse.isCrisis, true);
    assert.ok(abuse.flags.includes("abuse_or_neglect"));

    const spiritual = detectCrisis("I am in a spiritual crisis and feel God abandoned me.");
    assert.equal(spiritual.isCrisis, true);
    assert.ok(spiritual.flags.includes("spiritual_crisis"));
  });

  it("does not false-trigger crisis on ordinary warm church gratitude", () => {
    const safe = detectCrisis("My heart is full of gratitude for Sunday's message on Psalm 23. Please pray for safe travels.");
    assert.equal(safe.isCrisis, false);
    assert.deepEqual(safe.flags, []);
  });

  it("strips home address, unit number, doctor name, and medications while keeping public pharmacy clear", async () => {
    const transcript =
      "Hello, this is Martha Vance at 418 Sycamore Lane, Apt 4B. Dr. Patel switched my Eliquis and lisinopril after my biopsy, and I can't drive to Oak Street Pharmacy Friday at 2 PM. Please also pray for my divorce court date.";
    const spans = findSensitiveSpans(transcript);
    const types = new Set(spans.map((s) => s.type));
    assert.ok(types.has("street_address"));
    assert.ok(types.has("unit_number"));
    assert.ok(types.has("doctor"));
    assert.ok(types.has("medical_or_private"));

    const analyzed = await analyzeCallMessage({
      callerName: "Martha Vance",
      callerPhone: "(555) 014-8821",
      transcript,
    });
    assert.equal(analyzed.category, "errand");
    assert.equal(analyzed.status, "pending_review");
    assert.match(analyzed.volunteerSummary, /Martha V\./);
    assert.match(analyzed.volunteerSummary, /Oak Street Pharmacy/);
    assert.doesNotMatch(analyzed.volunteerSummary, /418 Sycamore|Apt 4B|Patel|Eliquis|lisinopril|biopsy|divorce/i);

    const scrubbed = scrubTextForVolunteer("Meet at 418 Sycamore Lane Apt 4B with Eliquis from Dr. Patel");
    assert.doesNotMatch(scrubbed, /418 Sycamore|Apt 4B|Eliquis|Dr\. Patel/i);
  });
});

describe("Unified IVR State Machine, TwiML XML & Twilio HMAC-SHA1 (ivr.mjs)", () => {
  it("maps digits 1, 2, 0 and escapes XML injection safely", () => {
    const menu = renderTwiml(resolveIvrStep(""), "https://bethany.vercel.app");
    assert.match(menu, /<Gather numDigits="1"/);
    assert.match(menu, /Grace Harbor Church/);

    const sermon = renderTwiml(resolveIvrStep("1"), "https://bethany.vercel.app");
    assert.match(sermon, /<Play>https:\/\/bethany\.vercel\.app\/api\/sermon\/audio<\/Play>/);

    const rec = renderTwiml(resolveIvrStep("2"), "https://bethany.vercel.app");
    assert.match(rec, /<Record /);

    const urgent = renderTwiml(resolveIvrStep("0"), "https://bethany.vercel.app");
    assert.match(urgent, /9 1 1/);
    assert.match(urgent, /9 8 8/);

    const injected = renderTwiml(resolveIvrStep('9</Say><Dial>555</Dial>'), "https://bethany.vercel.app");
    assert.doesNotMatch(injected, /<Dial>/);
    assert.match(injected, /&lt;Dial&gt;/);
  });

  it("verifies valid Twilio HMAC-SHA1 signatures and rejects forged ones", () => {
    const token = "test-twilio-auth-token";
    const fullUrl = "https://bethany.vercel.app/api/twiml";
    const params = { Digits: "1", From: "+15550148821" };
    const goodSig = computeTwilioSignature(token, fullUrl, params);

    assert.equal(verifyTwilioSignature({ authToken: token, fullUrl, params, headerSignature: goodSig }), true);
    assert.equal(verifyTwilioSignature({ authToken: token, fullUrl, params, headerSignature: "forged-sig==" }), false);
    assert.equal(verifyTwilioSignature({ authToken: token, fullUrl, params, headerSignature: "" }), false);
  });
});

describe("CSV Export & OWASP Formula-Injection Protection (exportCsv.mjs)", () => {
  it("exports Genesis ChMS and Planning Center formats and neutralizes leading formula chars", () => {
    const maliciousCall = {
      callerName: "=HYPERLINK(\"http://evil\",\"Martha\") Vance",
      callerPhone: "(555) 014-8821",
      category: "errand",
      status: "approved",
      assignedDeacon: "+cmd|' /C calc'!A0",
      volunteerSummary: "@SUM(1+1) Pharmacy pickup",
      pastoralSummary: "Summary",
      createdAt: "2026-11-26T09:10:00.000Z",
    };

    const genesis = exportCallsToCsv([maliciousCall], "genesis");
    assert.match(genesis, /^First Name,Last Name,Phone,Care Category,Status,Assigned Leader,Follow-Up Summary,Recorded At/);
    assert.match(genesis, /"'=HYPERLINK/);
    assert.match(genesis, /'\+cmd/);
    assert.match(genesis, /'@SUM/);

    const pco = exportCallsToCsv([maliciousCall], "planning_center");
    assert.match(pco, /^first_name,last_name,phone_number,workflow_card,stage,assignee,note,created_at/);
    assert.match(pco, /Bethany errand/);
  });
});

describe("Vercel EROFS Safety, Upstash Sync & Rock#7183 Guard (store.mjs)", () => {
  it("routes Vercel default SQLite path to os.tmpdir() instead of read-only project root", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const p = resolveDefaultDbPath("/var/task");
      assert.equal(p, path.join(os.tmpdir(), "bethany.db"));
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });

  it("returns empty array on unknown callerId instead of leaking all calls (Rock#7183)", async () => {
    const store = new BethanyStore(":memory:");
    await store.seedIfEmpty();
    assert.ok(store.listCalls().length >= 3);
    assert.deepEqual(store.listCalls({ callerId: "caller-does-not-exist" }), []);
    assert.deepEqual(store.listCalls({ callerId: "" }), []);
    store.close();
  });

  it("persists state across two independent serverless instances via Upstash REST", async () => {
    const kv = new Map();
    const mockUpstash = http.createServer(async (req, res) => {
      assert.equal(req.headers.authorization, "Bearer secret-token");
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const [cmd, key, val] = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      if (cmd === "GET") return res.end(JSON.stringify({ result: kv.get(key) ?? null }));
      if (cmd === "SET") {
        kv.set(key, val);
        return res.end(JSON.stringify({ result: "OK" }));
      }
      return res.end(JSON.stringify({ error: "unknown" }));
    });

    await new Promise((resolve) => mockUpstash.listen(0, "127.0.0.1", resolve));
    const { port } = mockUpstash.address();
    const upstash = { url: `http://127.0.0.1:${port}`, token: "secret-token" };

    const instance1 = new BethanyStore(":memory:", { upstash });
    const instance2 = new BethanyStore(":memory:", { upstash });
    try {
      assert.equal(instance1.getPersistenceMode(), "upstash_redis");
      await instance1.seedIfEmpty();
      instance1.approveCall("call-seed-003", { assignedDeacon: "Deacon Thomas Reid" });
      await instance1.syncToRemote();

      await instance2.seedIfEmpty();
      const hydratedMartha = instance2.getCallById("call-seed-003");
      assert.equal(hydratedMartha.status, "approved");
      assert.equal(hydratedMartha.assignedDeacon, "Deacon Thomas Reid");
    } finally {
      instance1.close();
      instance2.close();
      await new Promise((resolve) => mockUpstash.close(resolve));
    }
  });
});

describe("Live HTTP API, Server-Side RBAC, Transcribe & Twilio Webhook Integration", () => {
  let server;
  let store;
  let baseUrl;

  before(async () => {
    const app = await createBethanyApp({ dbPath: ":memory:", audioFilePath: AUDIO_PATH });
    server = app.server;
    store = app.store;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });

  it("defaults fail-closed to volunteer role and strips all PII/unapproved/prayer/crisis fields", async () => {
    const res = await fetch(`${baseUrl}/api/calls`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.role, "volunteer");
    assert.equal(data.count, 1);
    const item = data.calls[0];
    assert.equal(item.rawTranscript, undefined);
    assert.equal(item.callerName, undefined);
    assert.equal(item.callerPhone, undefined);
    assert.equal(item.redactedItems, undefined);
    assert.equal(item.pastoralSummary, undefined);
    assert.doesNotMatch(item.volunteerSummary, /209 Elmwood|cataract/i);
  });

  it("enforces pastor-only endpoints with 403 for volunteers and exposes full context to pastor", async () => {
    const volExport = await fetch(`${baseUrl}/api/export/csv?format=genesis`, {
      headers: { "x-bethany-role": "volunteer" },
    });
    assert.equal(volExport.status, 403);

    const volAudit = await fetch(`${baseUrl}/api/audit`, {
      headers: { "x-bethany-role": "volunteer" },
    });
    assert.equal(volAudit.status, 403);

    const volApprove = await fetch(`${baseUrl}/api/calls/call-seed-003/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "volunteer" },
      body: JSON.stringify({ assignedDeacon: "Deacon Thomas Reid" }),
    });
    assert.equal(volApprove.status, 403);

    const pastorList = await fetch(`${baseUrl}/api/calls`, {
      headers: { "x-bethany-role": "pastor" },
    });
    assert.equal(pastorList.status, 200);
    const pData = await pastorList.json();
    assert.equal(pData.count, 3);
    const martha = pData.calls.find((c) => c.id === "call-seed-003");
    assert.ok(martha.rawTranscript.includes("lisinopril"));
    assert.ok(martha.redactedItems.length >= 3);
  });

  it("approves Martha's call (uiOnly: true), scrubs PII overrides, and exports Genesis CSV", async () => {
    const approveRes = await fetch(`${baseUrl}/api/calls/call-seed-003/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({
        assignedDeacon: "Deacon Hannah Morales",
        volunteerSummary: "Martha V. · Pick up lisinopril at Oak Street Pharmacy from 418 Sycamore Lane · Friday 2 PM",
      }),
    });
    assert.equal(approveRes.status, 200);
    const approved = await approveRes.json();
    assert.doesNotMatch(approved.volunteerPreview.volunteerSummary, /lisinopril|418 Sycamore/i);

    const volRes = await fetch(`${baseUrl}/api/calls`, { headers: { "x-bethany-role": "volunteer" } });
    const volData = await volRes.json();
    assert.equal(volData.count, 2);

    const csvRes = await fetch(`${baseUrl}/api/export/csv?format=genesis`, {
      headers: { "x-bethany-role": "pastor" },
    });
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type"), /text\/csv/);
    assert.match(csvRes.headers.get("content-disposition"), /bethany-genesis\.csv/);
    const csv = await csvRes.text();
    assert.match(csv, /Martha,Vance/);
  });

  it("blocks crisis calls from volunteer dispatch (409), checks Twilio signatures, and enforces Rock#7183", async () => {
    const crisisRes = await fetch(`${baseUrl}/api/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({ presetKey: "evelyn_urgent" }),
    });
    assert.equal(crisisRes.status, 201);
    const crisisData = await crisisRes.json();
    assert.equal(crisisData.urgentEscalated, true);
    assert.equal(crisisData.call.status, "urgent_escalation");

    const badApprove = await fetch(`${baseUrl}/api/calls/${crisisData.call.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({ assignedDeacon: "Deacon Thomas Reid" }),
    });
    assert.equal(badApprove.status, 409);

    // Twilio signature enforcement when TWILIO_AUTH_TOKEN is set
    const prevToken = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_AUTH_TOKEN = "live-secret-token";
    try {
      const forged = await fetch(`${baseUrl}/api/twiml`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "bad" },
        body: "Digits=1&From=%2B15550148821",
      });
      assert.equal(forged.status, 403);

      const sig = computeTwilioSignature("live-secret-token", `${baseUrl}/api/twiml`, {
        Digits: "1",
        From: "+15550148821",
      });
      const signed = await fetch(`${baseUrl}/api/twiml`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": sig },
        body: "Digits=1&From=%2B15550148821",
      });
      assert.equal(signed.status, 200);
      const xml = await signed.text();
      assert.match(xml, /<Play>.*\/api\/sermon\/audio<\/Play>/);
    } finally {
      if (prevToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
      else process.env.TWILIO_AUTH_TOKEN = prevToken;
    }

    // Rock#7183 HTTP check
    const missingCaller = await fetch(`${baseUrl}/api/calls?callerId=unknown-999`, {
      headers: { "x-bethany-role": "pastor" },
    });
    const missingData = await missingCaller.json();
    assert.equal(missingData.count, 0);
  });

  it("validates /api/transcribe input bounds and reports clean 501 when no STT API key is set", async () => {
    const emptyRes = await fetch(`${baseUrl}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(emptyRes.status, 400);

    const prevGroq = process.env.GROQ_API_KEY;
    const prevGem = process.env.GEMINI_API_KEY;
    const prevOai = process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const noKeyRes = await fetch(`${baseUrl}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: Buffer.from("RIFFdemo").toString("base64"), mimeType: "audio/wav" }),
      });
      assert.equal(noKeyRes.status, 501);
    } finally {
      if (prevGroq) process.env.GROQ_API_KEY = prevGroq;
      if (prevGem) process.env.GEMINI_API_KEY = prevGem;
      if (prevOai) process.env.OPENAI_API_KEY = prevOai;
    }
  });

  it("streams real WAV pastor audio and enforces HTTP Range bounds (206 / 416)", async () => {
    assert.equal(fs.existsSync(AUDIO_PATH), true, "Expected data/pastor-sunday-recap.wav to exist");
    const full = await fetch(`${baseUrl}/api/sermon/audio`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "audio/wav");
    const buf = Buffer.from(await full.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString("ascii"), "RIFF");

    const partial = await fetch(`${baseUrl}/api/sermon/audio`, { headers: { Range: "bytes=0-1023" } });
    assert.equal(partial.status, 206);
    assert.equal((await partial.arrayBuffer()).byteLength, 1024);

    const badRange = await fetch(`${baseUrl}/api/sermon/audio`, { headers: { Range: "bytes=99999999-100000000" } });
    assert.equal(badRange.status, 416);
  });

  it("serves static frontend routes (/, /judge, /favicon.svg) and refuses path traversal", async () => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type"), /text\/html/);
    assert.match(await home.text(), /Church that comes home/);

    const judge = await fetch(`${baseUrl}/judge`);
    assert.equal(judge.status, 200);
    assert.match(judge.headers.get("content-type"), /text\/html/);

    const favicon = await fetch(`${baseUrl}/favicon.svg`);
    assert.equal(favicon.status, 200);
    assert.match(favicon.headers.get("content-type"), /image\/svg\+xml/);

    const traversal = await fetch(`${baseUrl}/%2e%2e/package.json`);
    assert.equal(traversal.status, 404);
  });

  it("blocks approving private prayers or already-resolved calls (409) [Audit B1 & B2]", async () => {
    // B1: private elder prayer (call-seed-002) must never enter volunteer dispatch
    const prayerApprove = await fetch(`${baseUrl}/api/calls/call-seed-002/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({ assignedDeacon: "Deacon Thomas Reid" }),
    });
    assert.equal(prayerApprove.status, 409);

    // B2: resolved call cannot be silently re-approved
    const resolved = await fetch(`${baseUrl}/api/calls/call-seed-001/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({ actorName: "Pastor David Chen" }),
    });
    assert.equal(resolved.status, 200);

    const reApprove = await fetch(`${baseUrl}/api/calls/call-seed-001/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({ assignedDeacon: "Deacon Hannah Morales" }),
    });
    assert.equal(reApprove.status, 409);
  });

  it("sanitizes forged x-forwarded headers in TwiML URLs [Audit S1]", async () => {
    const res = await fetch(`${baseUrl}/api/simulate/dtmf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-proto": "javascript",
        "x-forwarded-host": "evil.example/inject#bad",
      },
      body: JSON.stringify({ digit: "1" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.twimlPreview, /<Play>http:\/\/localhost:3001\/api\/sermon\/audio<\/Play>/);
    assert.doesNotMatch(data.twimlPreview, /javascript:|evil\.example/i);
  });

  it("detects expanded self-harm crisis phrasing deterministically [Audit S2]", () => {
    const overdose = detectCrisis("I think I overdosed and I want to die.");
    assert.equal(overdose.isCrisis, true);
    assert.ok(overdose.flags.includes("self_harm"));
    assert.equal(overdose.aiCounselingBlocked, true);
  });

  it("rolls back SQLite state cleanly if a remote Upstash snapshot is corrupted [Audit B3]", async () => {
    const store = new BethanyStore(":memory:");
    await store.seedIfEmpty();
    const beforeCount = store.listCalls().length;
    assert.equal(beforeCount, 3);

    assert.throws(() => {
      store.importSnapshot({
        calls: [
          {
            id: "bad-row",
            caller_id: "c1",
            caller_name: "Test",
            caller_label: "Test",
            caller_phone: "555",
            raw_transcript: "hello",
            category: "INVALID_CATEGORY_CHECK_FAIL",
            status: "pending_review",
            pastoral_summary: "s",
            volunteer_summary: null,
            requested_time: "now",
            redacted_items_json: "[]",
            crisis_flags_json: "[]",
            crisis_reasons_json: "[]",
            emergency_resources_json: "[]",
            ai_counseling_blocked: 1,
            extraction_mode: "deterministic_local",
            assigned_deacon: null,
            approved_by: null,
            approved_at: null,
            resolved_at: null,
            created_at: new Date().toISOString(),
          },
        ],
        audit: [],
      });
    });

    assert.equal(store.listCalls().length, beforeCount, "Existing local calls must survive failed snapshot import");
    store.close();
  });

  it("normalizes Vercel /api/index rewrite URLs without breaking query params or paths", () => {
    assert.equal(normalizeVercelRewriteUrl("/api/index?__path=health"), "/api/health");
    assert.equal(
      normalizeVercelRewriteUrl("/api/index?__path=calls&callerId=unknown-999&role=pastor"),
      "/api/calls?callerId=unknown-999&role=pastor"
    );
    assert.equal(
      normalizeVercelRewriteUrl("/api/calls?__path=calls&status=approved"),
      "/api/calls?status=approved"
    );
    assert.equal(normalizeVercelRewriteUrl("/api/twiml?step=recorded"), "/api/twiml?step=recorded");
  });
});
