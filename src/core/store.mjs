// Persistent store using Node 24 built-in node:sqlite + optional zero-dependency Upstash Redis REST sync.
// Safe on Vercel read-only filesystems: uses Upstash Redis when configured, /tmp/bethany.db fallback on Vercel,
// and data/bethany.db locally. Enforces uiOnly: true approval and Rock#7183 strict callerId scoping.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SEED_CALL_INPUTS, SUNDAY_SERMON } from "./fixtures.mjs";
import { analyzeCallMessage, scrubTextForVolunteer } from "./triage.mjs";

const UPSTASH_STATE_KEY = "bethany:state:v1";

export function resolveDefaultDbPath(rootDir) {
  if (process.env.BETHANY_DB_PATH) return process.env.BETHANY_DB_PATH;
  // Vercel serverless filesystem (/var/task) is read-only; /tmp avoids EROFS crashes.
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return path.join(os.tmpdir(), "bethany.db");
  }
  return path.join(rootDir, "data", "bethany.db");
}

function getUpstashConfig(explicit = null) {
  if (explicit) return explicit;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

function parseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    callerId: row.caller_id,
    callerName: row.caller_name,
    callerLabel: row.caller_label,
    callerPhone: row.caller_phone,
    rawTranscript: row.raw_transcript,
    category: row.category,
    status: row.status,
    pastoralSummary: row.pastoral_summary,
    volunteerSummary: row.volunteer_summary,
    requestedTime: row.requested_time,
    redactedItems: JSON.parse(row.redacted_items_json || "[]"),
    crisisFlags: JSON.parse(row.crisis_flags_json || "[]"),
    crisisReasons: JSON.parse(row.crisis_reasons_json || "[]"),
    emergencyResources: JSON.parse(row.emergency_resources_json || "[]"),
    aiCounselingBlocked: Boolean(row.ai_counseling_blocked),
    extractionMode: row.extraction_mode,
    assignedDeacon: row.assigned_deacon,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export class BethanyStore {
  constructor(dbPath = ":memory:", { upstash = null } = {}) {
    this.dbPath = dbPath;
    this.upstash = getUpstashConfig(upstash);
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.initSchema();
  }

  getPersistenceMode() {
    if (this.upstash) return "upstash_redis";
    if (this.dbPath === ":memory:") return "sqlite_memory";
    if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return "vercel_tmp_ephemeral";
    return "sqlite_disk";
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        external_sid TEXT,
        caller_id TEXT NOT NULL,
        caller_name TEXT NOT NULL,
        caller_label TEXT NOT NULL,
        caller_phone TEXT NOT NULL,
        raw_transcript TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('errand', 'visitation', 'prayer', 'urgent')),
        status TEXT NOT NULL CHECK (status IN ('pending_review', 'urgent_escalation', 'approved', 'resolved')),
        pastoral_summary TEXT NOT NULL,
        volunteer_summary TEXT,
        requested_time TEXT NOT NULL,
        redacted_items_json TEXT NOT NULL,
        crisis_flags_json TEXT NOT NULL,
        crisis_reasons_json TEXT NOT NULL,
        emergency_resources_json TEXT NOT NULL,
        ai_counseling_blocked INTEGER NOT NULL DEFAULT 1,
        extraction_mode TEXT NOT NULL,
        assigned_deacon TEXT,
        approved_by TEXT,
        approved_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON calls(caller_id);
      CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

      CREATE TABLE IF NOT EXISTS sermons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        speaker TEXT NOT NULL,
        date TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        audio_path TEXT NOT NULL,
        is_synthetic_demo_audio INTEGER NOT NULL DEFAULT 1,
        transcript TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT,
        action TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Lightweight forward migration for pre-existing local SQLite files
    const cols = this.db.prepare("PRAGMA table_info(calls)").all();
    if (!cols.some((c) => c.name === "external_sid")) {
      this.db.exec("ALTER TABLE calls ADD COLUMN external_sid TEXT;");
    }
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_external_sid ON calls(external_sid) WHERE external_sid IS NOT NULL;");
    this.db.exec("PRAGMA user_version = 1;");
  }

  async upstashCommand(commandArray) {
    if (!this.upstash) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(this.upstash.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.upstash.token}`,
        },
        body: JSON.stringify(commandArray),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  exportSnapshot() {
    const calls = this.db.prepare("SELECT * FROM calls ORDER BY created_at ASC").all();
    const audit = this.db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
    return { calls, audit };
  }

  importSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.calls)) return;
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db.exec("DELETE FROM calls; DELETE FROM audit_log;");
      const insertCall = this.db.prepare(`
        INSERT INTO calls (
          id, external_sid, caller_id, caller_name, caller_label, caller_phone, raw_transcript,
          category, status, pastoral_summary, volunteer_summary, requested_time,
          redacted_items_json, crisis_flags_json, crisis_reasons_json, emergency_resources_json,
          ai_counseling_blocked, extraction_mode, assigned_deacon, approved_by, approved_at, resolved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of snapshot.calls) {
        insertCall.run(
          r.id,
          r.external_sid ?? null,
          r.caller_id,
          r.caller_name,
          r.caller_label,
          r.caller_phone,
          r.raw_transcript,
          r.category,
          r.status,
          r.pastoral_summary,
          r.volunteer_summary,
          r.requested_time,
          r.redacted_items_json,
          r.crisis_flags_json,
          r.crisis_reasons_json,
          r.emergency_resources_json,
          r.ai_counseling_blocked,
          r.extraction_mode,
          r.assigned_deacon,
          r.approved_by,
          r.approved_at,
          r.resolved_at,
          r.created_at
        );
      }
      const insertAudit = this.db.prepare(
        `INSERT INTO audit_log (call_id, action, actor_role, actor_name, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const a of snapshot.audit || []) {
        insertAudit.run(a.call_id, a.action, a.actor_role, a.actor_name, a.detail, a.created_at);
      }
      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  async syncFromRemote() {
    if (!this.upstash) return false;
    const data = await this.upstashCommand(["GET", UPSTASH_STATE_KEY]);
    if (!data?.result) return false;
    try {
      const snapshot = JSON.parse(data.result);
      this.importSnapshot(snapshot);
      return true;
    } catch {
      return false;
    }
  }

  async syncToRemote() {
    if (!this.upstash) return false;
    // shortcut: stores whole demo ledger as one JSON key in Upstash Redis; move to Postgres rows once congregation exceeds ~500 calls.
    const serialized = JSON.stringify(this.exportSnapshot());
    const data = await this.upstashCommand(["SET", UPSTASH_STATE_KEY, serialized]);
    return Boolean(data && !data.error);
  }

  logAudit({ callId = null, action, actorRole, actorName, detail, createdAt = new Date().toISOString() }) {
    this.db
      .prepare(
        `INSERT INTO audit_log (call_id, action, actor_role, actor_name, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(callId, action, actorRole, actorName, detail, createdAt);
  }

  getSermon() {
    const row = this.db.prepare("SELECT * FROM sermons ORDER BY date DESC LIMIT 1").get();
    if (!row) return SUNDAY_SERMON;
    return {
      id: row.id,
      title: row.title,
      speaker: row.speaker,
      date: row.date,
      durationSeconds: row.duration_seconds,
      audioPath: row.audio_path,
      isSyntheticDemoAudio: Boolean(row.is_synthetic_demo_audio),
      transcript: row.transcript,
    };
  }

  upsertSermon(sermon) {
    this.db
      .prepare(
        `INSERT INTO sermons (id, title, speaker, date, duration_seconds, audio_path, is_synthetic_demo_audio, transcript)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           speaker = excluded.speaker,
           date = excluded.date,
           duration_seconds = excluded.duration_seconds,
           audio_path = excluded.audio_path,
           is_synthetic_demo_audio = excluded.is_synthetic_demo_audio,
           transcript = excluded.transcript`
      )
      .run(
        sermon.id,
        sermon.title,
        sermon.speaker,
        sermon.date,
        sermon.durationSeconds,
        sermon.audioPath,
        sermon.isSyntheticDemoAudio ? 1 : 0,
        sermon.transcript
      );
  }

  createCall(analyzed, { id = null, externalSid = null, createdAt = new Date().toISOString() } = {}) {
    const cleanSid = externalSid ? String(externalSid).trim() : null;
    if (cleanSid) {
      const existingRow = this.db.prepare("SELECT * FROM calls WHERE external_sid = ?").get(cleanSid);
      if (existingRow) {
        // Upgrade a pending Twilio recording placeholder when async TranscriptionText arrives later
        if (
          existingRow.extraction_mode === "twilio_recording_pending" &&
          analyzed.extractionMode !== "twilio_recording_pending"
        ) {
          this.db
            .prepare(
              `UPDATE calls SET
                raw_transcript = ?, category = ?, status = ?, pastoral_summary = ?,
                volunteer_summary = ?, requested_time = ?, redacted_items_json = ?,
                crisis_flags_json = ?, crisis_reasons_json = ?, emergency_resources_json = ?,
                ai_counseling_blocked = ?, extraction_mode = ?
               WHERE id = ?`
            )
            .run(
              analyzed.rawTranscript,
              analyzed.category,
              analyzed.status,
              analyzed.pastoralSummary,
              analyzed.volunteerSummary,
              analyzed.requestedTime,
              JSON.stringify(analyzed.redactedItems || []),
              JSON.stringify(analyzed.crisisFlags || []),
              JSON.stringify(analyzed.crisisReasons || []),
              JSON.stringify(analyzed.emergencyResources || []),
              analyzed.aiCounselingBlocked ? 1 : 0,
              analyzed.extractionMode,
              existingRow.id
            );
          return this.getCallById(existingRow.id);
        }
        return parseRow(existingRow);
      }
    }

    const callId = id || `call-${crypto.randomUUID().slice(0, 8)}`;
    this.db
      .prepare(
        `INSERT INTO calls (
          id, external_sid, caller_id, caller_name, caller_label, caller_phone, raw_transcript,
          category, status, pastoral_summary, volunteer_summary, requested_time,
          redacted_items_json, crisis_flags_json, crisis_reasons_json, emergency_resources_json,
          ai_counseling_blocked, extraction_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        callId,
        cleanSid,
        analyzed.callerId,
        analyzed.callerName,
        analyzed.callerLabel,
        analyzed.callerPhone,
        analyzed.rawTranscript,
        analyzed.category,
        analyzed.status,
        analyzed.pastoralSummary,
        analyzed.volunteerSummary,
        analyzed.requestedTime,
        JSON.stringify(analyzed.redactedItems || []),
        JSON.stringify(analyzed.crisisFlags || []),
        JSON.stringify(analyzed.crisisReasons || []),
        JSON.stringify(analyzed.emergencyResources || []),
        analyzed.aiCounselingBlocked ? 1 : 0,
        analyzed.extractionMode,
        createdAt
      );

    this.logAudit({
      callId,
      action: analyzed.status === "urgent_escalation" ? "crisis_escalated" : "call_received",
      actorRole: "system",
      actorName: "bethany-ivr",
      detail:
        analyzed.status === "urgent_escalation"
          ? `Deterministic crisis gate fired: ${(analyzed.crisisFlags || []).join(", ")}`
          : `Queued ${analyzed.category} for human pastor review (${(analyzed.redactedItems || []).length} sensitive spans masked)`,
      createdAt,
    });

    return this.getCallById(callId);
  }

  getCallById(id) {
    const row = this.db.prepare("SELECT * FROM calls WHERE id = ?").get(String(id || ""));
    return parseRow(row);
  }

  listCalls({ callerId = undefined, status = undefined } = {}) {
    // Rock#7183 guard: when callerId is supplied, filter strictly; never dump all records if not found.
    const clauses = [];
    const params = [];
    if (callerId !== undefined) {
      const normalized = String(callerId).trim();
      if (!normalized) return [];
      clauses.push("caller_id = ?");
      params.push(normalized);
    }
    if (status) {
      clauses.push("status = ?");
      params.push(String(status).trim());
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM calls ${where}
         ORDER BY CASE status WHEN 'urgent_escalation' THEN 0 WHEN 'pending_review' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
         created_at DESC`
      )
      .all(...params);
    return rows.map(parseRow);
  }

  approveCall(id, { assignedDeacon, approvedBy = "Pastor David Chen", volunteerSummaryOverride = null } = {}) {
    const existing = this.getCallById(id);
    if (!existing) {
      throw Object.assign(new Error(`Call "${id}" not found.`), { status: 404 });
    }
    if (existing.category === "urgent" || existing.status === "urgent_escalation") {
      throw Object.assign(
        new Error("Urgent crisis calls cannot be dispatched to the general volunteer pool; pastor must handle directly."),
        { status: 409 }
      );
    }
    if (existing.category === "prayer") {
      throw Object.assign(
        new Error("Private prayer requests stay with pastors and elders and cannot be dispatched to volunteers."),
        { status: 409 }
      );
    }
    if (existing.status === "resolved") {
      throw Object.assign(
        new Error("Resolved calls cannot be re-dispatched to volunteers."),
        { status: 409 }
      );
    }
    const deacon = String(assignedDeacon || "").trim();
    if (!deacon) {
      throw Object.assign(new Error("assignedDeacon is required to approve and dispatch."), { status: 400 });
    }

    const safeSummary =
      volunteerSummaryOverride !== null && String(volunteerSummaryOverride).trim()
        ? scrubTextForVolunteer(volunteerSummaryOverride)
        : existing.volunteerSummary;

    const approvedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE calls
         SET status = 'approved', assigned_deacon = ?, approved_by = ?, approved_at = ?, volunteer_summary = ?
         WHERE id = ?`
      )
      .run(deacon, approvedBy, approvedAt, safeSummary, id);

    this.logAudit({
      callId: id,
      action: "call_approved",
      actorRole: "pastor",
      actorName: approvedBy,
      detail: `Approved and assigned to ${deacon}`,
      createdAt: approvedAt,
    });

    return this.getCallById(id);
  }

  resolveCall(id, { actorRole, actorName = "Care Team" } = {}) {
    const existing = this.getCallById(id);
    if (!existing) {
      throw Object.assign(new Error(`Call "${id}" not found.`), { status: 404 });
    }
    if (actorRole !== "pastor" && (existing.status !== "approved" || existing.category === "urgent" || existing.category === "prayer")) {
      throw Object.assign(new Error("Forbidden: volunteers may only complete approved errands or visits."), { status: 403 });
    }
    const resolvedAt = new Date().toISOString();
    this.db.prepare("UPDATE calls SET status = 'resolved', resolved_at = ? WHERE id = ?").run(resolvedAt, id);

    this.logAudit({
      callId: id,
      action: "call_resolved",
      actorRole,
      actorName,
      detail: `Marked ${existing.category} complete`,
      createdAt: resolvedAt,
    });

    return this.getCallById(id);
  }

  listAuditLog(limit = 40) {
    return this.db
      .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?")
      .all(Math.max(1, Math.min(200, Number(limit) || 40)))
      .map((r) => ({
        id: r.id,
        callId: r.call_id,
        action: r.action,
        actorRole: r.actor_role,
        actorName: r.actor_name,
        detail: r.detail,
        createdAt: r.created_at,
      }));
  }

  async _insertSeedRecords() {
    for (const item of SEED_CALL_INPUTS) {
      const analyzed = await analyzeCallMessage({
        callerId: item.callerId,
        callerName: item.callerName,
        callerPhone: item.callerPhone,
        transcript: item.transcript,
        skipAi: true,
      });
      const created = this.createCall(analyzed, { id: item.id, createdAt: item.createdAt });
      if (item.preApprove) {
        this.approveCall(created.id, item.preApprove);
      }
    }
    await this.syncToRemote();
  }

  async seedIfEmpty() {
    this.upsertSermon(SUNDAY_SERMON);
    if (this.upstash) {
      const hydrated = await this.syncFromRemote();
      if (hydrated && this.db.prepare("SELECT COUNT(*) AS count FROM calls").get().count > 0) return;
    }
    const { count } = this.db.prepare("SELECT COUNT(*) AS count FROM calls").get();
    if (count > 0) return;
    await this._insertSeedRecords();
  }

  async resetDemo() {
    this.db.exec("DELETE FROM calls; DELETE FROM audit_log;");
    await this._insertSeedRecords();
  }

  close() {
    this.db.close();
  }
}
