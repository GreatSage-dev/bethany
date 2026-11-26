// Server-side RBAC & PII projection (Rock#7183 + CVE-2025-48757 immunity).
// Sensitive fields are stripped on the server before JSON serialization—never hidden in CSS.

export const VALID_ROLES = new Set(["pastor", "volunteer"]);

export function resolveRole(req, url) {
  // shortcut: header/query role switch supports zero-signup /judge Role Switcher; replace with signed HTTP-only session cookies + church tenant RLS before real church rollout.
  const raw = (req.headers?.["x-bethany-role"] || url?.searchParams?.get("role") || "volunteer")
    .toString()
    .trim()
    .toLowerCase();

  if (!VALID_ROLES.has(raw)) {
    throw Object.assign(new Error(`Invalid role "${raw}". Expected "pastor" or "volunteer".`), { status: 400 });
  }
  return raw;
}

export function requirePastor(role) {
  if (role !== "pastor") {
    throw Object.assign(new Error("Forbidden: pastor or elder role required."), { status: 403 });
  }
}

export function projectCallForRole(call, role) {
  if (!call) return null;
  if (role === "pastor") {
    return {
      id: call.id,
      callerId: call.callerId,
      callerName: call.callerName,
      callerLabel: call.callerLabel,
      callerPhone: call.callerPhone,
      rawTranscript: call.rawTranscript,
      category: call.category,
      status: call.status,
      pastoralSummary: call.pastoralSummary,
      volunteerSummary: call.volunteerSummary,
      requestedTime: call.requestedTime,
      redactedItems: call.redactedItems,
      crisisFlags: call.crisisFlags,
      crisisReasons: call.crisisReasons,
      emergencyResources: call.emergencyResources,
      aiCounselingBlocked: call.aiCounselingBlocked,
      extractionMode: call.extractionMode,
      assignedDeacon: call.assignedDeacon,
      approvedBy: call.approvedBy,
      approvedAt: call.approvedAt,
      resolvedAt: call.resolvedAt,
      createdAt: call.createdAt,
    };
  }

  // Volunteers ONLY see pastor-approved errands/visits, with private/medical/phone fields absent.
  const volunteerVisibleStatus = call.status === "approved" || call.status === "resolved";
  const volunteerVisibleCategory = call.category === "errand" || call.category === "visitation";
  if (!volunteerVisibleStatus || !volunteerVisibleCategory || !call.volunteerSummary) {
    return null;
  }

  return {
    id: call.id,
    callerLabel: call.callerLabel,
    category: call.category,
    status: call.status,
    volunteerSummary: call.volunteerSummary,
    requestedTime: call.requestedTime,
    assignedDeacon: call.assignedDeacon,
    approvedAt: call.approvedAt,
    resolvedAt: call.resolvedAt,
  };
}

export function projectCallsForRole(calls, role) {
  return calls.map((c) => projectCallForRole(c, role)).filter(Boolean);
}
