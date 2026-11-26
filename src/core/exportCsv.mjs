// 1-click Genesis ChMS & Planning Center People CSV export with spreadsheet formula-injection sanitization.

function sanitizeCsvCell(value) {
  let str = String(value ?? "").replace(/\r?\n/g, " ").trim();
  // Prevent CSV/Excel formula injection (OWASP CSV injection defense).
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function splitName(fullName) {
  const parts = String(fullName || "Church Member").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || "Church", last: "Member" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function exportCallsToCsv(calls, format = "genesis") {
  const normalized = String(format || "genesis").toLowerCase();
  if (normalized !== "genesis" && normalized !== "planning_center") {
    throw Object.assign(new Error(`Unsupported CSV format "${format}". Use "genesis" or "planning_center".`), { status: 400 });
  }

  if (normalized === "planning_center") {
    const header = ["first_name", "last_name", "phone_number", "workflow_card", "stage", "assignee", "note", "created_at"];
    const rows = calls.map((c) => {
      const { first, last } = splitName(c.callerName);
      return [
        first,
        last,
        c.callerPhone,
        `Bethany ${c.category}`,
        c.status,
        c.assignedDeacon || "Unassigned",
        c.volunteerSummary || c.pastoralSummary,
        c.createdAt,
      ]
        .map(sanitizeCsvCell)
        .join(",");
    });
    return [header.join(","), ...rows].join("\r\n");
  }

  // Genesis ChMS standard import format
  const header = [
    "First Name",
    "Last Name",
    "Phone",
    "Care Category",
    "Status",
    "Assigned Leader",
    "Follow-Up Summary",
    "Recorded At",
  ];
  const rows = calls.map((c) => {
    const { first, last } = splitName(c.callerName);
    return [
      first,
      last,
      c.callerPhone,
      c.category,
      c.status,
      c.assignedDeacon || "Unassigned",
      c.volunteerSummary || c.pastoralSummary,
      c.createdAt,
    ]
      .map(sanitizeCsvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\r\n");
}
