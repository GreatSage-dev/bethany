// Supreme Architectural Boundary: AI parses messy speech; deterministic code owns
// crisis escalation and PII redaction so AI can never counsel or leak private details.

const CRISIS_RULES = [
  {
    flag: "self_harm",
    label: "Self-harm or suicidal distress (Barna 94% immediate handoff)",
    patterns: [
      /\b(kill myself|end my life|end it all|suicide|suicidal|hurt myself|harm myself|took too many pills|overdos(?:e|ed|ing))\b/i,
      /\b(want to die|don'?t want to (live|be here|keep going|wake up)|can'?t go on|no reason to live|nobody would miss me)\b/i,
    ],
    resources: ["Call or text 988 (Suicide & Crisis Lifeline)", "Call 911 if in immediate danger"],
  },
  {
    flag: "abuse_or_neglect",
    label: "Abuse or domestic danger (Barna 90% immediate handoff)",
    patterns: [
      /\b(hits me|hitting me|abusing me|domestic violence|unsafe at home|threw me against|afraid of my (husband|wife|son|caregiver))\b/i,
      /\b(child abuse|elder abuse|locked me in|threatening to hurt)\b/i,
    ],
    resources: ["Call 911 if unsafe right now", "National Domestic Violence Hotline: 1-800-799-7233"],
  },
  {
    flag: "medical_emergency",
    label: "Urgent medical emergency (Barna 84% immediate handoff)",
    patterns: [
      /\b(chest (hurts|pain)|heart attack|can'?t breathe|cannot breathe|trouble breathing|having a stroke|passing out)\b/i,
      /\b(fell (in|on|down)|cannot get up|can'?t get up|bleeding badly|can'?t stop bleeding|lost consciousness)\b/i,
    ],
    resources: ["Call 911 immediately for emergency medical care"],
  },
  {
    flag: "spiritual_crisis",
    label: "Acute spiritual distress (Barna 71% pastor handoff)",
    patterns: [
      /\b(god (abandoned|hates) me|losing my faith completely|spiritual crisis|in despair)\b/i,
    ],
    resources: ["Immediate human pastor callback queued — AI counseling disabled"],
  },
];

const ADDRESS_RE =
  /\b\d{1,5}\s+[A-Za-z0-9'.-]+(?:\s+[A-Za-z0-9'.-]+){0,3}\s+(?:St|Street|Ave|Avenue|Ln|Lane|Rd|Road|Dr|Drive|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Cir|Circle)\b\.?/gi;
const UNIT_RE = /\b(?:Apt|Apartment|Unit|Suite)\s*#?\s*[A-Za-z0-9-]+\b/gi;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const DOCTOR_RE = /\bDr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
const MEDICAL_RE =
  /\b(lisinopril|metformin|insulin|warfarin|atorvastatin|eliquis|xarelto|lipitor|oxycodone|painkillers?|blood pressure(?: pills?)?|cholesterol|cataract(?: surgery)?|surgery|hip(?: is acting up)?|chemo(?:therapy)?|cancer|biopsy|tumor|mri|pacemaker|dialysis|diabetes|diabetic|arthritis|cardiologist|oncologist|therapist|psychiatrist|dementia|alzheimer'?s|depression|bipolar|anxiety|addiction|rehab|overdose|miscarriage|divorce|eviction|bankruptcy|diagnosis|pills?|medication|hospital(?:ized)?)\b/gi;

export function formatCallerLabel(fullName) {
  const parts = String(fullName || "Church Member")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "Church Member";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function detectCrisis(transcript) {
  const text = String(transcript || "");
  const flags = [];
  const reasons = [];
  const resourceSet = new Set();

  for (const rule of CRISIS_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      flags.push(rule.flag);
      reasons.push(rule.label);
      for (const r of rule.resources) resourceSet.add(r);
    }
  }

  return {
    isCrisis: flags.length > 0,
    severity: flags.length > 0 ? "urgent" : "none",
    flags,
    reasons,
    emergencyResources: [...resourceSet],
    aiCounselingBlocked: true,
  };
}

export function findSensitiveSpans(transcript) {
  const text = String(transcript || "");
  const found = [];
  const collect = (type, re) => {
    for (const m of text.matchAll(re)) {
      found.push({ type, value: m[0].trim() });
    }
  };
  collect("street_address", ADDRESS_RE);
  collect("unit_number", UNIT_RE);
  collect("phone", PHONE_RE);
  collect("email", EMAIL_RE);
  collect("doctor", DOCTOR_RE);
  collect("medical_or_private", MEDICAL_RE);

  const seen = new Set();
  return found.filter((item) => {
    const key = `${item.type}:${item.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scrubTextForVolunteer(text) {
  return String(text || "")
    .replace(ADDRESS_RE, "[address withheld]")
    .replace(UNIT_RE, "[unit withheld]")
    .replace(PHONE_RE, "[phone withheld]")
    .replace(EMAIL_RE, "[email withheld]")
    .replace(DOCTOR_RE, "[clinician withheld]")
    .replace(MEDICAL_RE, "[private detail]")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDeterministicFields(transcript) {
  const text = String(transcript || "").trim();
  const timeMatch = text.match(
    /\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today)(?:\s+(?:morning|afternoon|evening|night))?(?:\s+(?:at|around|before|by)\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))?|\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i
  );
  const requestedTime = timeMatch ? timeMatch[0].trim() : "This week (confirm by phone)";

  const locationMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z']+){0,2}\s+(?:Pharmacy|Clinic|Market|Grocery)|CVS|Walgreens|Walmart|Kroger|Publix|Trader Joe'?s)\b/
  );
  const publicLocation = locationMatch ? locationMatch[0].trim() : null;

  let category = "prayer";
  let errandAction = null;

  if (/\b(pharmacy|prescription|cvs|walgreens|pick up)\b/i.test(text)) {
    category = "errand";
    errandAction = "Pharmacy pickup";
  } else if (/\b(grocer(?:y|ies)|food|meal|trader joe|walmart|kroger|publix|drop off)\b/i.test(text)) {
    category = "errand";
    errandAction = "Grocery delivery";
  } else if (/\b(ride|drive me|pick me up|appointment|lift to church)\b/i.test(text)) {
    category = "errand";
    errandAction = "Transportation ride";
  } else if (/\b(visit|stop by|lonely|come over|communion at home)\b/i.test(text)) {
    category = "visitation";
    errandAction = "Home care visit";
  }

  const pastoralSummary =
    category === "errand"
      ? `${errandAction}${publicLocation ? ` (${publicLocation})` : ""} requested for ${requestedTime}.`
      : category === "visitation"
        ? `Home visitation requested for ${requestedTime}.`
        : "Prayer request left for pastors and elders.";

  return { category, errandAction, publicLocation, requestedTime, pastoralSummary };
}

const SYSTEM_EXTRACT_PROMPT =
  "Extract church voicemail intake into strict JSON with keys: category (errand|visitation|prayer), errandAction (short 2-4 word practical task or null), publicLocation (public store/pharmacy name only, NEVER a home address, or null), requestedTime (short string), pastoralSummary (1 plain sentence). Never offer counseling or spiritual advice.";

function normalizeAiJson(parsed, extractionMode) {
  const allowed = new Set(["errand", "visitation", "prayer"]);
  if (!parsed || !allowed.has(parsed.category)) return null;
  return {
    category: parsed.category,
    errandAction: typeof parsed.errandAction === "string" ? parsed.errandAction.slice(0, 60) : null,
    publicLocation: typeof parsed.publicLocation === "string" ? parsed.publicLocation.slice(0, 60) : null,
    requestedTime: typeof parsed.requestedTime === "string" ? parsed.requestedTime.slice(0, 60) : "This week",
    pastoralSummary:
      typeof parsed.pastoralSummary === "string" ? parsed.pastoralSummary.slice(0, 220) : "Caller left a voice message.",
    extractionMode,
  };
}

export function cleanEnvSecret(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/^[A-Z0-9_]+\s*=\s*/, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/[\r\n]+/g, "").trim();
}

async function fetchJsonWithTimeout(url, options, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryAiStructuredExtract(transcript) {
  // shortcut: falls back cleanly to deterministic local extractor when no free GROQ_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY is configured or free quota hits 429.
  const snippet = String(transcript || "").slice(0, 1200);

  const groqKey = cleanEnvSecret(process.env.GROQ_API_KEY);
  const geminiKey = cleanEnvSecret(process.env.GEMINI_API_KEY);
  const openaiKey = cleanEnvSecret(process.env.OPENAI_API_KEY);

  if (groqKey) {
    const model = cleanEnvSecret(process.env.GROQ_MODEL) || "openai/gpt-oss-20b";
    const data = await fetchJsonWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          reasoning_effort: "low",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_EXTRACT_PROMPT },
            { role: "user", content: snippet },
          ],
        }),
      },
      15000
    );
    if (data) {
      try {
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
        const norm = normalizeAiJson(parsed, "groq_llm");
        if (norm) return norm;
      } catch {
        // Fall through to next provider or deterministic extractor.
      }
    }
  }

  if (geminiKey) {
    const model = cleanEnvSecret(process.env.GEMINI_MODEL) || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const data = await fetchJsonWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_EXTRACT_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: snippet }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (data) {
      try {
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const norm = normalizeAiJson(JSON.parse(raw), "gemini_llm");
        if (norm) return norm;
      } catch {
        // Fall through to next provider or deterministic extractor.
      }
    }
  }

  if (openaiKey) {
    const data = await fetchJsonWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: cleanEnvSecret(process.env.OPENAI_MODEL) || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_EXTRACT_PROMPT },
          { role: "user", content: snippet },
        ],
      }),
    });
    if (data) {
      try {
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
        const norm = normalizeAiJson(parsed, "openai_llm");
        if (norm) return norm;
      } catch {
        // Fall through to deterministic extractor.
      }
    }
  }

  return null;
}

export async function transcribeAudioBuffer({ buffer, mimeType = "audio/webm", filename = "voicemail.webm" }) {
  if (!buffer || buffer.length === 0) {
    throw Object.assign(new Error("Audio payload is empty."), { status: 400 });
  }
  if (buffer.length > 4 * 1024 * 1024) {
    throw Object.assign(new Error("Audio file exceeds 4MB limit."), { status: 413 });
  }

  const groqKey = cleanEnvSecret(process.env.GROQ_API_KEY);
  const geminiKey = cleanEnvSecret(process.env.GEMINI_API_KEY);
  const openaiKey = cleanEnvSecret(process.env.OPENAI_API_KEY);
  const hasConfiguredKey = Boolean(groqKey || geminiKey || openaiKey);

  // Free Tier #1: Groq Whisper (whisper-large-v3-turbo) — zero credit card required.
  if (groqKey) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    form.append("model", cleanEnvSecret(process.env.GROQ_WHISPER_MODEL) || "whisper-large-v3-turbo");
    form.append("response_format", "json");
    const data = await fetchJsonWithTimeout(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: form },
      25000
    );
    if (data?.text) return { transcript: String(data.text).trim(), provider: "groq_whisper" };
  }

  // Free Tier #2: Google Gemini native audio understanding — zero credit card required.
  if (geminiKey) {
    const model = cleanEnvSecret(process.env.GEMINI_MODEL) || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const data = await fetchJsonWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Transcribe this church voicemail accurately verbatim. Output only the spoken transcript text." },
                { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
      25000
    );
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return { transcript: text, provider: "gemini_audio" };
  }

  // Optional OpenAI Whisper
  if (openaiKey) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    form.append("model", "whisper-1");
    const data = await fetchJsonWithTimeout(
      "https://api.openai.com/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form },
      25000
    );
    if (data?.text) return { transcript: String(data.text).trim(), provider: "openai_whisper" };
  }

  if (hasConfiguredKey) {
    throw Object.assign(new Error("Upstream speech-to-text provider timed out or rejected the audio payload."), { status: 502 });
  }

  throw Object.assign(
    new Error(
      "No speech-to-text API key configured (set free GROQ_API_KEY or GEMINI_API_KEY), or submit browser SpeechRecognition text directly to POST /api/calls."
    ),
    { status: 501 }
  );
}

export function buildVolunteerSummary(callerLabel, { category, errandAction, publicLocation, requestedTime }) {
  if (category === "urgent" || category === "prayer") return null;
  const action = scrubTextForVolunteer(errandAction || (category === "visitation" ? "Home care visit" : "Practical errand"));
  const loc = publicLocation ? ` at ${scrubTextForVolunteer(publicLocation)}` : "";
  const when = scrubTextForVolunteer(requestedTime || "Time to be confirmed by church office");
  return `${callerLabel} · ${action}${loc} · ${when}`;
}

export async function analyzeCallMessage({ callerId, callerName, callerPhone, transcript, skipAi = false }) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript) {
    throw Object.assign(new Error("Transcript cannot be empty."), { status: 400 });
  }

  const callerLabel = formatCallerLabel(callerName);
  const crisis = detectCrisis(cleanTranscript);
  const redactedItems = findSensitiveSpans(cleanTranscript);

  const aiExtracted = crisis.isCrisis || skipAi ? null : await tryAiStructuredExtract(cleanTranscript);
  const extracted = aiExtracted || { ...extractDeterministicFields(cleanTranscript), extractionMode: "deterministic_local" };

  if (crisis.isCrisis) {
    return {
      callerId: callerId || `caller-${callerLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      callerName: String(callerName || "Church Member").trim(),
      callerLabel,
      callerPhone: String(callerPhone || "(555) 010-0000").trim(),
      rawTranscript: cleanTranscript,
      category: "urgent",
      status: "urgent_escalation",
      pastoralSummary: `URGENT PASTORAL ESCALATION (${crisis.flags.join(", ")}): Immediate human callback required.`,
      volunteerSummary: null,
      requestedTime: "IMMEDIATE",
      redactedItems,
      crisisFlags: crisis.flags,
      crisisReasons: crisis.reasons,
      emergencyResources: crisis.emergencyResources,
      aiCounselingBlocked: true,
      extractionMode: "deterministic_crisis_gate",
    };
  }

  const volunteerSummary = buildVolunteerSummary(callerLabel, extracted);
  return {
    callerId: callerId || `caller-${callerLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    callerName: String(callerName || "Church Member").trim(),
    callerLabel,
    callerPhone: String(callerPhone || "(555) 010-0000").trim(),
    rawTranscript: cleanTranscript,
    category: extracted.category,
    status: "pending_review",
    pastoralSummary: extracted.pastoralSummary,
    volunteerSummary,
    requestedTime: extracted.requestedTime,
    redactedItems,
    crisisFlags: [],
    crisisReasons: [],
    emergencyResources: [],
    aiCounselingBlocked: true,
    extractionMode: extracted.extractionMode,
  };
}
