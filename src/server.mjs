// Zero-dependency Node 24 HTTP API + Twilio TwiML Voice webhook server (runs locally & inside Vercel Functions).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportCallsToCsv } from "./core/exportCsv.mjs";
import { CALLER_PRESETS, CHURCH_PROFILE, DEMO_DEACONS } from "./core/fixtures.mjs";
import { renderTwiml, resolveIvrStep, verifyTwilioSignature, xmlEscape } from "./core/ivr.mjs";
import { projectCallForRole, projectCallsForRole, requirePastor, resolveRole } from "./core/rbac.mjs";
import { BethanyStore, resolveDefaultDbPath } from "./core/store.mjs";
import { analyzeCallMessage, transcribeAudioBuffer } from "./core/triage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
// Load local .env automatically via Node 24 built-in (no dotenv dependency); skipped on Vercel.
if (!process.env.VERCEL && fs.existsSync(path.join(ROOT_DIR, ".env"))) {
  try {
    process.loadEnvFile(path.join(ROOT_DIR, ".env"));
  } catch {
    // Ignore malformed optional local .env
  }
}
const DEFAULT_AUDIO_PATH = fs.existsSync(path.join(ROOT_DIR, "data", "pastor-sunday-recap.wav"))
  ? path.join(ROOT_DIR, "data", "pastor-sunday-recap.wav")
  : path.join(process.cwd(), "data", "pastor-sunday-recap.wav");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MAX_JSON_BYTES = 64 * 1024;
const MAX_AUDIO_JSON_BYTES = 6 * 1024 * 1024; // base64 overhead for <=4MB audio

const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function tryServeStatic(req, res, pathname) {
  if (req.method !== "GET" || pathname.startsWith("/api/")) return false;
  const rel =
    pathname === "/"
      ? "index.html"
      : pathname === "/phone" || pathname === "/judge"
        ? "phone.html"
        : pathname.replace(/^\/+/, "");
  const abs = path.resolve(PUBLIC_DIR, rel);
  // Prevent directory traversal outside public/
  if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== path.join(PUBLIC_DIR, "index.html")) return false;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  const ext = path.extname(abs).toLowerCase();
  const mime = STATIC_MIME[ext] || "application/octet-stream";
  setCommonHeaders(res, mime);
  res.setHeader(
    "Cache-Control",
    ext === ".html" || ext === ".css" || ext === ".js" ? "no-cache" : "public, max-age=3600"
  );
  res.writeHead(200);
  fs.createReadStream(abs).pipe(res);
  return true;
}

function setCommonHeaders(res, contentType) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bethany-role");
}

function sendJson(res, status, payload) {
  setCommonHeaders(res, "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

function sendXml(res, status, xml) {
  setCommonHeaders(res, "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status);
  res.end(xml);
}

async function readBody(req, maxBytes = MAX_JSON_BYTES) {
  // Support pre-parsed body in runtimes like Vercel Node.js functions when present.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  let raw = "";
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > maxBytes) {
      throw Object.assign(new Error(`Request body too large (max ${Math.round(maxBytes / 1024)}KB).`), { status: 413 });
    }
    raw = req.body.trim();
  } else {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw Object.assign(new Error(`Request body too large (max ${Math.round(maxBytes / 1024)}KB).`), { status: 413 });
      }
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString("utf8").trim();
  }
  if (!raw) return {};

  const ct = String(req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw Object.assign(new Error("JSON body must be an object."), { status: 400 });
    }
    return parsed;
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error("Invalid JSON request body."), { status: 400 });
  }
}

function serveAudio(req, res, audioFilePath) {
  if (!fs.existsSync(audioFilePath)) {
    return sendJson(res, 404, { error: "Pastor audio file not found." });
  }
  const stat = fs.statSync(audioFilePath);
  const total = stat.size;
  setCommonHeaders(res, "audio/wav");
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
      if (start >= total || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": end - start + 1,
      });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(audioFilePath, { start, end }).pipe(res);
    }
  }
  res.writeHead(200, { "Content-Length": total });
  if (req.method === "HEAD") return res.end();
  return fs.createReadStream(audioFilePath).pipe(res);
}

function getBaseUrl(req) {
  const rawProto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim().toLowerCase();
  const proto = rawProto === "https" ? "https" : "http";
  const rawHost = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:3001")
    .split(",")[0]
    .trim();
  const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(rawHost) ? rawHost : "localhost:3001";
  return `${proto}://${host}`;
}

function getAiProviderLabel() {
  if (process.env.GROQ_API_KEY) return "groq_free_tier";
  if (process.env.GEMINI_API_KEY) return "gemini_free_tier";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "deterministic_local";
}

export async function createBethanyApp({
  dbPath = resolveDefaultDbPath(ROOT_DIR),
  audioFilePath = DEFAULT_AUDIO_PATH,
  upstash = null,
} = {}) {
  const store = new BethanyStore(dbPath, { upstash });
  await store.seedIfEmpty();

  const handler = async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        setCommonHeaders(res, "text/plain");
        res.writeHead(204);
        return res.end();
      }

      const baseUrl = getBaseUrl(req);
      const url = new URL(req.url || "/", baseUrl);
      const { pathname } = url;

      if (req.method === "GET" && pathname === "/api/health") {
        await store.syncFromRemote();
        const all = store.listCalls();
        return sendJson(res, 200, {
          ok: true,
          service: "bethany-backend",
          church: CHURCH_PROFILE.name,
          callsCount: all.length,
          aiMode: getAiProviderLabel(),
          persistenceMode: store.getPersistenceMode(),
          twilioSignatureEnforced: Boolean(process.env.TWILIO_AUTH_TOKEN),
          audioReady: fs.existsSync(audioFilePath),
        });
      }

      if (req.method === "GET" && pathname === "/api/meta") {
        return sendJson(res, 200, {
          brand: { name: "Bethany", tagline: "Church that comes home." },
          church: CHURCH_PROFILE,
          sermon: store.getSermon(),
          deacons: DEMO_DEACONS,
          presets: Object.values(CALLER_PRESETS).map(({ key, label, callerName, transcript }) => ({
            key,
            label,
            callerName,
            transcript,
          })),
        });
      }

      if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/sermon/audio") {
        return serveAudio(req, res, audioFilePath);
      }

      // Live audio transcription via free Groq Whisper or free Google Gemini (<=4MB audio)
      if (req.method === "POST" && pathname === "/api/transcribe") {
        const body = await readBody(req, MAX_AUDIO_JSON_BYTES);
        const rawB64 = String(body.audioBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
        if (!rawB64) {
          throw Object.assign(new Error("audioBase64 is required."), { status: 400 });
        }
        const buffer = Buffer.from(rawB64, "base64");
        const mimeType = String(body.mimeType || "audio/webm").slice(0, 60);
        const filename = String(body.filename || "voicemail.webm").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const result = await transcribeAudioBuffer({ buffer, mimeType, filename });
        return sendJson(res, 200, result);
      }

      // Real Twilio Voice webhook (application/x-www-form-urlencoded or JSON)
      if (req.method === "POST" && pathname === "/api/twiml") {
        const body = await readBody(req);
        const fullUrl = `${baseUrl}${req.url}`;
        const validSig = verifyTwilioSignature({
          authToken: process.env.TWILIO_AUTH_TOKEN,
          fullUrl,
          params: body,
          headerSignature: req.headers["x-twilio-signature"],
        });
        if (!validSig) {
          return sendJson(res, 403, { error: "Invalid Twilio webhook signature." });
        }

        await store.syncFromRemote();
        const step = url.searchParams.get("step");

        if (step === "recorded" || body.TranscriptionText) {
          const transcript = String(body.TranscriptionText || body.transcript || "").trim();
          const callerPhone = String(body.From || "(555) 014-0000").trim();
          if (transcript) {
            const analyzed = await analyzeCallMessage({
              callerName: String(body.CallerName || "Phone Caller"),
              callerPhone,
              transcript,
            });
            store.createCall(analyzed);
            await store.syncToRemote();
          }
          const ack = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            "<Response>",
            `  <Say voice="Polly.Joanna">${xmlEscape(
              "Thank you. Your message has been received by Grace Harbor Church. A pastor or deacon will review it personally. Goodbye."
            )}</Say>`,
            "</Response>",
          ].join("\n");
          return sendXml(res, 200, ack);
        }

        const digit = body.Digits ?? body.digit ?? "";
        const ivrState = resolveIvrStep(digit);
        if (ivrState.urgentTransfer) {
          const urgent = await analyzeCallMessage({
            callerName: String(body.CallerName || "Urgent Landline Caller"),
            callerPhone: String(body.From || "(555) 014-0000"),
            transcript: "Caller pressed 0 requesting urgent pastoral care — spiritual crisis / immediate callback requested.",
          });
          store.createCall(urgent);
          await store.syncToRemote();
        }
        return sendXml(res, 200, renderTwiml(ivrState, baseUrl));
      }

      // Browser Touch-Tone simulator using the exact same IVR state machine
      if (req.method === "POST" && pathname === "/api/simulate/dtmf") {
        const body = await readBody(req);
        const ivrState = resolveIvrStep(body.digit ?? "");
        return sendJson(res, 200, {
          ...ivrState,
          sermon: ivrState.step === "sermon_playback" ? store.getSermon() : null,
          twimlPreview: renderTwiml(ivrState, baseUrl),
        });
      }

      // List calls — strict server-side RBAC + Rock#7183 callerId guard
      if (req.method === "GET" && pathname === "/api/calls") {
        const role = resolveRole(req, url);
        await store.syncFromRemote();
        const callerId = url.searchParams.has("callerId") ? url.searchParams.get("callerId") : undefined;
        const status = url.searchParams.get("status") || undefined;
        const rawCalls = store.listCalls({ callerId, status });
        const calls = projectCallsForRole(rawCalls, role);
        return sendJson(res, 200, { role, count: calls.length, calls });
      }

      // Create / intake a new voice message (preset or live transcript)
      if (req.method === "POST" && pathname === "/api/calls") {
        const role = resolveRole(req, url);
        const body = await readBody(req);
        const preset = body.presetKey ? CALLER_PRESETS[body.presetKey] : null;
        if (body.presetKey && !preset) {
          throw Object.assign(new Error(`Unknown preset "${body.presetKey}".`), { status: 400 });
        }

        const callerName = String(preset?.callerName || body.callerName || "Church Caller").trim().slice(0, 80);
        const callerPhone = String(preset?.callerPhone || body.callerPhone || "(555) 014-0000").trim().slice(0, 30);
        const callerId = preset?.callerId || body.callerId || undefined;
        const transcript = String(preset?.transcript || body.transcript || "").trim();

        if (transcript.length < 3 || transcript.length > 2000) {
          throw Object.assign(new Error("Transcript must be between 3 and 2000 characters."), { status: 400 });
        }

        await store.syncFromRemote();
        const analyzed = await analyzeCallMessage({ callerId, callerName, callerPhone, transcript });
        const created = store.createCall(analyzed);
        await store.syncToRemote();
        return sendJson(res, 201, {
          role,
          call: projectCallForRole(created, role),
          queuedForPastorReview: created.status === "pending_review",
          urgentEscalated: created.status === "urgent_escalation",
          emergencyResources: created.emergencyResources,
        });
      }

      // Approve & dispatch call (Pastor-only, enforces uiOnly: true)
      const approveMatch = /^\/api\/calls\/([^/]+)\/approve$/.exec(pathname);
      if (req.method === "POST" && approveMatch) {
        const role = resolveRole(req, url);
        requirePastor(role);
        const body = await readBody(req);
        await store.syncFromRemote();
        const updated = store.approveCall(decodeURIComponent(approveMatch[1]), {
          assignedDeacon: body.assignedDeacon,
          approvedBy: body.approvedBy || CHURCH_PROFILE.pastorName,
          volunteerSummaryOverride: body.volunteerSummary ?? null,
        });
        await store.syncToRemote();
        return sendJson(res, 200, {
          role,
          call: projectCallForRole(updated, "pastor"),
          volunteerPreview: projectCallForRole(updated, "volunteer"),
        });
      }

      // Mark call resolved
      const resolveMatch = /^\/api\/calls\/([^/]+)\/resolve$/.exec(pathname);
      if (req.method === "POST" && resolveMatch) {
        const role = resolveRole(req, url);
        const body = await readBody(req);
        await store.syncFromRemote();
        const updated = store.resolveCall(decodeURIComponent(resolveMatch[1]), {
          actorRole: role,
          actorName: String(body.actorName || (role === "pastor" ? CHURCH_PROFILE.pastorName : "Assigned Deacon")).slice(0, 80),
        });
        await store.syncToRemote();
        return sendJson(res, 200, {
          role,
          call: projectCallForRole(updated, role),
        });
      }

      // Pastor-only Genesis ChMS / Planning Center CSV export
      if (req.method === "GET" && pathname === "/api/export/csv") {
        const role = resolveRole(req, url);
        requirePastor(role);
        await store.syncFromRemote();
        const format = (url.searchParams.get("format") || "genesis").trim().toLowerCase();
        const calls = store.listCalls();
        const csv = exportCallsToCsv(calls, format);
        setCommonHeaders(res, "text/csv; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Disposition", `attachment; filename="bethany-${format}.csv"`);
        res.writeHead(200);
        return res.end(csv);
      }

      // Pastor-only audit log
      if (req.method === "GET" && pathname === "/api/audit") {
        const role = resolveRole(req, url);
        requirePastor(role);
        await store.syncFromRemote();
        const limit = Number(url.searchParams.get("limit") || 40);
        return sendJson(res, 200, { role, entries: store.listAuditLog(limit) });
      }

      // Reset synthetic demo fixtures (Pastor-only)
      if (req.method === "POST" && pathname === "/api/demo/reset") {
        const role = resolveRole(req, url);
        requirePastor(role);
        await store.resetDemo();
        return sendJson(res, 200, { ok: true, count: store.listCalls().length });
      }

      if (tryServeStatic(req, res, pathname)) return;

      return sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      const status = err.status || 500;
      const message = status >= 500 ? "Internal server error." : err.message;
      return sendJson(res, status, { error: message });
    }
  };

  const server = http.createServer(handler);
  return { handler, server, store };
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  const port = Number(process.env.PORT || 3001);
  const { server } = await createBethanyApp();
  server.listen(port, () => {
    console.log(`Bethany backend listening on http://localhost:${port}`);
  });
}
