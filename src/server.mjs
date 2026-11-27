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
import { analyzeCallMessage, cleanEnvSecret, isAiAuthHealthy, transcribeAudioBuffer } from "./core/triage.mjs";

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
  if (process.env.CORS_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bethany-role");
  }
}

function getClientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "local";
}

function createRateLimiter(windowMs = 60_000) {
  const buckets = new Map();
  return function enforceRateLimit(req, bucketName, maxPerWindow) {
    if (!maxPerWindow || maxPerWindow <= 0) return;
    const now = Date.now();
    if (buckets.size > 2000) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }
    const key = `${bucketName}:${getClientIp(req)}`;
    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > maxPerWindow) {
      throw Object.assign(new Error("Too many requests. Please wait a minute and try again."), {
        status: 429,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      });
    }
  };
}

async function tryFetchTwilioRecordingBuffer(recordingUrl) {
  const raw = String(recordingUrl || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = {};
    const sid = cleanEnvSecret(process.env.TWILIO_ACCOUNT_SID);
    const token = cleanEnvSecret(process.env.TWILIO_AUTH_TOKEN);
    if (sid && token) {
      headers.Authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
    }
    const wavUrl = /\.wav($|\?)/i.test(raw) ? raw : `${raw}.wav`;
    const res = await fetch(wavUrl, { headers, signal: controller.signal });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > 4 * 1024 * 1024) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  if (cleanEnvSecret(process.env.GROQ_API_KEY)) return "groq_free_tier";
  if (cleanEnvSecret(process.env.GEMINI_API_KEY)) return "gemini_free_tier";
  if (cleanEnvSecret(process.env.OPENAI_API_KEY)) return "openai";
  return "deterministic_local";
}

function isAiKeyFormatValid() {
  const groq = cleanEnvSecret(process.env.GROQ_API_KEY);
  if (groq) return groq.startsWith("gsk_");
  const gemini = cleanEnvSecret(process.env.GEMINI_API_KEY);
  if (gemini) return gemini.startsWith("AIza");
  const openai = cleanEnvSecret(process.env.OPENAI_API_KEY);
  if (openai) return openai.startsWith("sk-");
  return true;
}

export async function createBethanyApp({
  dbPath = resolveDefaultDbPath(ROOT_DIR),
  audioFilePath = DEFAULT_AUDIO_PATH,
  upstash = null,
  rateLimitPerMin = 45,
  transcribeLimitPerMin = 15,
} = {}) {
  const store = new BethanyStore(dbPath, { upstash });
  const enforceRateLimit = createRateLimiter(60_000);
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
          aiKeyFormatValid: isAiKeyFormatValid(),
          aiAuthHealthy: isAiAuthHealthy(),
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
        enforceRateLimit(req, "transcribe", transcribeLimitPerMin);
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
        enforceRateLimit(req, "twiml", rateLimitPerMin);
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

        const step = url.searchParams.get("step");

        if (step === "recorded" || step === "transcribed" || body.TranscriptionText || body.RecordingUrl) {
          let transcript = String(body.TranscriptionText || body.transcript || "").trim();
          const callerPhone = String(body.From || "(555) 014-0000").trim();
          const callerName = String(body.CallerName || "Phone Caller").trim();
          const externalSid = String(body.RecordingSid || body.CallSid || "").trim() || null;

          if (!transcript && body.RecordingUrl) {
            const recBuf = await tryFetchTwilioRecordingBuffer(body.RecordingUrl);
            if (recBuf) {
              try {
                const stt = await transcribeAudioBuffer({
                  buffer: recBuf,
                  mimeType: "audio/wav",
                  filename: "twilio-recording.wav",
                });
                transcript = stt.transcript;
              } catch {
                // Fall back to safe pending callback record below so no voicemail is ever dropped.
              }
            }
          }

          const analyzed = transcript
            ? await analyzeCallMessage({ callerName, callerPhone, transcript })
            : {
                callerId: `caller-${callerPhone.replace(/[^0-9]+/g, "") || "landline"}`,
                callerName,
                callerLabel: "Phone Caller",
                callerPhone,
                rawTranscript: "Voice recording received on landline. Audio awaiting pastor playback or transcription callback.",
                category: "prayer",
                status: "pending_review",
                pastoralSummary: "Landline voice recording received; follow up by phone.",
                volunteerSummary: null,
                requestedTime: "Callback requested",
                redactedItems: [],
                crisisFlags: [],
                crisisReasons: [],
                emergencyResources: [],
                aiCounselingBlocked: true,
                extractionMode: "twilio_recording_pending",
              };

          await store.syncFromRemote();
          store.createCall(analyzed, { externalSid });
          await store.syncToRemote();

          if (step === "transcribed") {
            return sendJson(res, 200, { ok: true });
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

        const digitOrSpeech = body.Digits ?? body.digit ?? body.SpeechResult ?? "";
        const ivrState = resolveIvrStep(digitOrSpeech);
        if (ivrState.urgentTransfer) {
          const urgentSid = body.CallSid ? `urgent-${String(body.CallSid).trim()}` : null;
          const urgent = await analyzeCallMessage({
            callerName: String(body.CallerName || "Urgent Landline Caller"),
            callerPhone: String(body.From || "(555) 014-0000"),
            transcript: "Caller pressed 0 requesting urgent pastoral care — spiritual crisis / immediate callback requested.",
          });
          await store.syncFromRemote();
          store.createCall(urgent, { externalSid: urgentSid });
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
        enforceRateLimit(req, "writes", rateLimitPerMin);
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

        const analyzed = await analyzeCallMessage({ callerId, callerName, callerPhone, transcript });
        await store.syncFromRemote();
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
        enforceRateLimit(req, "reset", Math.min(10, rateLimitPerMin));
        const role = resolveRole(req, url);
        requirePastor(role);
        await store.resetDemo();
        return sendJson(res, 200, { ok: true, count: store.listCalls().length });
      }

      if (tryServeStatic(req, res, pathname)) return;

      return sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      const status = err.status || 500;
      if (err.retryAfterSec) {
        res.setHeader("Retry-After", String(err.retryAfterSec));
      }
      if (status === 500 || status >= 502) {
        console.error(`[bethany] ${req.method} ${req.url} -> ${status}: ${err?.message || "unhandled error"}`);
      }
      const message = status === 500 ? "Internal server error." : err.message;
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
