// Bethany interactive console — zero dependencies, real WebAudio DTMF tones,
// live Pastor WAV streaming, Groq Whisper mic transcription, and live server-side RBAC.

const DTMF_FREQS = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
};

const state = {
  role: "pastor",
  meta: null,
  calls: [],
  lastRawPayload: null,
  audioCtx: null,
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  callSeconds: 0,
  callTimerId: null,
};

const el = (id) => document.getElementById(id);
const audio = el("sermon-audio");

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => { t.hidden = true; }, 3400);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = String(s % 60).padStart(2, "0");
  return `${m}:${rem}`;
}

function playDtmfTone(digit) {
  const pair = DTMF_FREQS[digit];
  if (!pair) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    if (state.audioCtx.state === "suspended") state.audioCtx.resume();

    const now = state.audioCtx.currentTime;
    const gain = state.audioCtx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    gain.connect(state.audioCtx.destination);

    for (const freq of pair) {
      const osc = state.audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  } catch {
    // AudioContext optional on restricted devices
  }
}

function startCallClock() {
  if (state.callTimerId) return;
  state.callSeconds = 0;
  state.callTimerId = setInterval(() => {
    state.callSeconds += 1;
    const mins = String(Math.floor(state.callSeconds / 60)).padStart(2, "0");
    const secs = String(state.callSeconds % 60).padStart(2, "0");
    el("screen-timer").textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallClock() {
  if (state.callTimerId) clearInterval(state.callTimerId);
  state.callTimerId = null;
  state.callSeconds = 0;
  el("screen-timer").textContent = "00:00";
}

function syncAudioUi() {
  const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 26;
  const pct = Math.min(100, (audio.currentTime / dur) * 100);
  el("hero-audio-fill").style.width = `${pct}%`;
  el("handset-audio-fill").style.width = `${pct}%`;
  el("hero-audio-time").textContent = `${formatClock(audio.currentTime)} / ${formatClock(dur)}`;
  el("handset-audio-clock").textContent = formatClock(audio.currentTime);

  const playing = !audio.paused;
  const playSvg = document.querySelector("#card-play-btn .icon-play");
  const pauseSvg = document.querySelector("#card-play-btn .icon-pause");
  if (playSvg && pauseSvg) {
    playSvg.hidden = playing;
    pauseSvg.hidden = !playing;
  }
  el("hero-play-btn").textContent = playing ? "Pause Sunday's message" : "Hear Sunday's message";
  el("handset-audio-toggle").textContent = playing ? "Pause" : "Play";
}

function toggleSermonAudio(forcePlay = false) {
  if (forcePlay || audio.paused) {
    audio.play().catch(() => showToast("Tap play once more to allow audio playback in your browser."));
  } else {
    audio.pause();
  }
  syncAudioUi();
}

audio.addEventListener("timeupdate", syncAudioUi);
audio.addEventListener("play", syncAudioUi);
audio.addEventListener("pause", syncAudioUi);
audio.addEventListener("ended", () => {
  syncAudioUi();
  el("screen-state").textContent = "MESSAGE FINISHED · PRESS 2 FOR NEED";
});

// Scroll header state
function syncNavScroll() {
  el("site-nav").classList.toggle("is-scrolled", window.scrollY > 48);
}
window.addEventListener("scroll", syncNavScroll, { passive: true });
syncNavScroll();

// API helpers
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), "x-bethany-role": state.role };
  const res = await fetch(path, { ...options, headers });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    throw new Error(typeof data === "object" && data.error ? data.error : `Request failed (${res.status})`);
  }
  return data;
}

function highlightRedactedTranscript(rawTranscript, redactedItems = []) {
  let html = escapeHtml(rawTranscript);
  const sorted = [...redactedItems]
    .map((item) => item.value)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const val of sorted) {
    const escapedVal = escapeHtml(val).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(escapedVal, "gi"), (m) => `<mark class="pii-mark" title="Redacted from volunteer view">${m}</mark>`);
  }
  return html;
}

function renderCalls() {
  const list = el("call-list");
  const isPastor = state.role === "pastor";

  el("ledger-heading").textContent = isPastor ? "Pastor care queue" : "Volunteer errand cards";
  el("ledger-subtitle").textContent = isPastor
    ? "Full transcripts and medical flags visible only to pastors. Nothing reaches volunteers until approved."
    : "Only pastor-approved errands appear here. Private health details, addresses, prayers, and crises never leave the server.";
  el("pastor-tools").hidden = !isPastor;
  el("volunteer-banner").hidden = isPastor;
  el("json-drawer-label").textContent = `GET /api/calls (x-bethany-role: ${state.role}) · ${state.calls.length} record(s)`;
  el("json-preview").textContent = JSON.stringify(state.lastRawPayload, null, 2);

  if (!state.calls.length) {
    list.innerHTML = `<div class="empty-state">${
      isPastor
        ? "No calls in the queue yet. Press 2 on the keypad to record or send a message."
        : "No approved errands assigned yet. Switch to Pastor view to approve a pending request."
    }</div>`;
    return;
  }

  const deacons = state.meta?.deacons || ["Deacon Thomas Reid", "Deacon Hannah Morales", "Elder Grace Okafor"];
  const deaconOpts = deacons.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");

  list.innerHTML = state.calls
    .map((c) => {
      const isUrgent = c.status === "urgent_escalation" || c.category === "urgent";
      const badgeClass = isUrgent ? "urgent" : c.status === "approved" ? "approved" : c.status === "pending_review" ? "pending" : "";
      const statusText = c.status.replace(/_/g, " ");
      const displayName = isPastor ? c.callerName : c.callerLabel;

      if (!isPastor) {
        return `
          <article class="call-row">
            <div class="call-row-top">
              <div class="call-who">
                <span class="call-name">${escapeHtml(displayName)}</span>
                <span class="status-tag ${badgeClass}">${escapeHtml(statusText)}</span>
              </div>
              <span class="mono call-phone">${escapeHtml(c.assignedDeacon || "Unassigned")}</span>
            </div>
            <p class="call-summary">${escapeHtml(c.volunteerSummary)}</p>
            <div class="call-actions">
              ${
                c.status === "approved"
                  ? `<button type="button" class="tool-btn" data-action="resolve" data-id="${escapeHtml(c.id)}">Mark errand complete</button>`
                  : `<span class="mono call-phone">Completed</span>`
              }
            </div>
            <div class="call-meta-foot mono">
              <span>rawTranscript: excluded by server</span>
              <span>callerPhone: excluded by server</span>
              <span>medicalDetails: excluded by server</span>
            </div>
          </article>`;
      }

      const crisisHtml = isUrgent
        ? `<div class="crisis-alert-box">
             <strong>Deterministic crisis gate active — AI counseling blocked.</strong>
             <ul>${(c.emergencyResources || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
           </div>`
        : "";

      const volunteerPreviewHtml = c.volunteerSummary
        ? `<div class="volunteer-preview-strip">
             <span class="volunteer-preview-label">Volunteer-safe card preview (${(c.redactedItems || []).length} private spans redacted)</span>
             ${escapeHtml(c.volunteerSummary)}
           </div>`
        : !isUrgent
          ? `<div class="volunteer-preview-strip">
               <span class="volunteer-preview-label">Elder &amp; pastor only</span>
               Private prayer request — never dispatched to errand volunteers.
             </div>`
          : "";

      let actionHtml = "";
      if (isUrgent && c.status !== "resolved") {
        actionHtml = `<button type="button" class="pill-btn pill-dark" style="padding:8px 16px;font-size:13px" data-action="resolve" data-id="${escapeHtml(c.id)}">Confirm pastor callback completed</button>`;
      } else if (c.status === "pending_review" && c.category !== "prayer") {
        actionHtml = `
          <select class="deacon-select" id="deacon-${escapeHtml(c.id)}" aria-label="Assign deacon">${deaconOpts}</select>
          <button type="button" class="pill-btn pill-dark" style="padding:8px 16px;font-size:13px" data-action="approve" data-id="${escapeHtml(c.id)}">Approve &amp; assign deacon</button>`;
      } else if (c.status === "pending_review" && c.category === "prayer") {
        actionHtml = `<button type="button" class="tool-btn" data-action="resolve" data-id="${escapeHtml(c.id)}">Mark prayed over by elders</button>`;
      } else if (c.status === "approved") {
        actionHtml = `
          <span class="mono call-phone">Assigned to ${escapeHtml(c.assignedDeacon)}</span>
          <button type="button" class="tool-btn" data-action="resolve" data-id="${escapeHtml(c.id)}">Mark complete</button>`;
      } else {
        actionHtml = `<span class="mono call-phone">Resolved · ${escapeHtml(c.assignedDeacon || "Care team")}</span>`;
      }

      return `
        <article class="call-row ${isUrgent ? "is-urgent" : ""}">
          <div class="call-row-top">
            <div class="call-who">
              <span class="call-name">${escapeHtml(displayName)}</span>
              <span class="mono call-phone">${escapeHtml(c.callerPhone)}</span>
            </div>
            <span class="status-tag ${badgeClass}">${escapeHtml(c.category)} · ${escapeHtml(statusText)}</span>
          </div>
          <p class="call-summary">${escapeHtml(c.pastoralSummary)}</p>
          <div class="transcript-box">${highlightRedactedTranscript(c.rawTranscript, c.redactedItems)}</div>
          ${crisisHtml}
          ${volunteerPreviewHtml}
          <div class="call-actions">${actionHtml}</div>
          <div class="call-meta-foot mono">
            <span>engine: ${escapeHtml(c.extractionMode)}</span>
            <span>redacted: ${(c.redactedItems || []).length} spans</span>
            <span>id: ${escapeHtml(c.id)}</span>
          </div>
        </article>`;
    })
    .join("");
}

async function refreshCalls() {
  try {
    const data = await apiFetch("/api/calls");
    state.calls = data.calls || [];
    state.lastRawPayload = data;
    renderCalls();
  } catch (err) {
    el("call-list").innerHTML = `<div class="empty-state">Unable to load calls: ${escapeHtml(err.message)}</div>`;
  }
}

async function handleKeypad(digit) {
  playDtmfTone(digit);
  const btn = document.querySelector(`.dial-key[data-digit="${CSS.escape(digit)}"]`);
  if (btn) {
    btn.classList.add("is-pressed");
    setTimeout(() => btn.classList.remove("is-pressed"), 140);
  }

  if (digit === "#") {
    audio.pause();
    audio.currentTime = 0;
    stopCallClock();
    el("screen-audio-strip").hidden = true;
    el("call-dot").classList.remove("is-urgent");
    el("screen-state").textContent = "CALL ENDED · ON HOOK";
    el("screen-prompt").textContent = "Thank you for calling Grace Harbor Church. Press 1, 2, or 0 anytime.";
    return;
  }

  startCallClock();
  const mappedDigit = digit === "*" ? "" : digit;
  try {
    const res = await apiFetch("/api/simulate/dtmf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digit: mappedDigit }),
    });

    el("twiml-preview").textContent = res.twimlPreview || "";
    el("screen-prompt").textContent = res.spokenText;
    el("call-dot").classList.toggle("is-urgent", Boolean(res.urgentTransfer));

    if (res.step === "sermon_playback") {
      el("screen-state").textContent = "CONNECTED · PLAYING PASTOR AUDIO";
      el("screen-audio-strip").hidden = false;
      audio.currentTime = 0;
      toggleSermonAudio(true);
    } else if (res.step === "record_need") {
      audio.pause();
      el("screen-audio-strip").hidden = true;
      el("screen-state").textContent = "CONNECTED · READY TO RECORD NEED";
      el("caller-transcript").focus();
    } else if (res.step === "urgent_care") {
      audio.pause();
      el("screen-audio-strip").hidden = true;
      el("screen-state").textContent = "URGENT ESCALATION · 911 / 988";
      // Trigger urgent escalation record in backend so pastor desk updates live
      await submitPresetCall("evelyn_urgent");
    } else {
      audio.pause();
      el("screen-audio-strip").hidden = true;
      el("screen-state").textContent = "CONNECTED · MAIN MENU";
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function submitPresetCall(presetKey) {
  const feedback = el("intake-feedback");
  feedback.textContent = "Processing...";
  try {
    const res = await apiFetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetKey }),
    });
    if (res.urgentEscalated) {
      el("call-dot").classList.add("is-urgent");
      el("screen-state").textContent = "CRISIS GATE FIRED · PASTOR ALERTED";
      el("screen-prompt").textContent = "Urgent distress detected. AI counseling blocked. 911 / 988 surfaced and pastor alerted.";
      feedback.textContent = "Escalated to pastor (0 AI counseling)";
      showToast("Deterministic crisis gate fired — escalated directly to pastor.");
    } else {
      feedback.textContent = "Queued for pastor review";
      showToast("Voice note analyzed and queued for human pastor approval.");
    }
    await refreshCalls();
  } catch (err) {
    feedback.textContent = err.message;
  }
}

// Live microphone capture -> POST /api/transcribe (Groq Whisper)
async function toggleMicRecording() {
  const btn = el("mic-record-btn");
  const label = el("mic-btn-label");
  const feedback = el("intake-feedback");

  if (state.isRecording && state.mediaRecorder) {
    state.mediaRecorder.stop();
    state.isRecording = false;
    btn.classList.remove("is-recording");
    label.textContent = "Transcribing...";
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("Microphone recording unavailable in this browser — type or pick a preset caller below.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const recorder = new MediaRecorder(stream, { mimeType });
    state.mediaRecorder = recorder;
    state.isRecording = true;

    btn.classList.add("is-recording");
    label.textContent = "Stop recording";
    feedback.textContent = "Listening...";

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(state.audioChunks, { type: mimeType });
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const res = await apiFetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64: reader.result,
              mimeType,
              filename: mimeType.includes("webm") ? "caller.webm" : "caller.m4a",
            }),
          });
          el("caller-transcript").value = res.transcript;
          feedback.textContent = `Transcribed (${res.provider})`;
          showToast("Voice transcribed via Groq Whisper — review or click Send to care desk.");
        } catch (err) {
          feedback.textContent = err.message;
          showToast(err.message);
        } finally {
          label.textContent = "Record mic";
        }
      };
      reader.readAsDataURL(blob);
    };

    recorder.start();
  } catch {
    showToast("Microphone permission declined — you can type or click any preset scenario below.");
    label.textContent = "Record mic";
  }
}

async function downloadCsv(format) {
  try {
    const res = await fetch(`/api/export/csv?format=${encodeURIComponent(format)}`, {
      headers: { "x-bethany-role": state.role },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bethany-${format}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded bethany-${format}.csv`);
  } catch (err) {
    showToast(err.message);
  }
}

// Event bindings
document.querySelectorAll(".dial-key").forEach((btn) => {
  btn.addEventListener("click", () => handleKeypad(btn.dataset.digit));
});

el("hero-play-btn").addEventListener("click", () => toggleSermonAudio());
el("card-play-btn").addEventListener("click", () => toggleSermonAudio());
el("handset-audio-toggle").addEventListener("click", () => toggleSermonAudio());
el("mic-record-btn").addEventListener("click", toggleMicRecording);

document.querySelectorAll(".role-tab").forEach((tab) => {
  tab.addEventListener("click", async () => {
    state.role = tab.dataset.role;
    document.querySelectorAll(".role-tab").forEach((t) => {
      const active = t.dataset.role === state.role;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });
    await refreshCalls();
  });
});

document.querySelectorAll(".preset-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const preset = state.meta?.presets?.find((p) => p.key === chip.dataset.preset);
    if (preset) {
      el("caller-name").value = preset.callerName;
      el("caller-transcript").value = preset.transcript;
    }
    submitPresetCall(chip.dataset.preset);
  });
});

el("call-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const callerName = el("caller-name").value.trim();
  const transcript = el("caller-transcript").value.trim();
  if (!transcript) return;
  const feedback = el("intake-feedback");
  feedback.textContent = "Analyzing...";
  el("submit-call-btn").disabled = true;
  try {
    const res = await apiFetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callerName, transcript }),
    });
    feedback.textContent = res.urgentEscalated ? "Urgent pastor alert sent" : "Queued for pastor approval";
    el("caller-transcript").value = "";
    await refreshCalls();
    showToast(res.urgentEscalated ? "Crisis gate fired — pastor alerted immediately." : "Call added to pastor care queue.");
  } catch (err) {
    feedback.textContent = err.message;
  } finally {
    el("submit-call-btn").disabled = false;
  }
});

el("call-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  try {
    if (action === "approve") {
      const select = el(`deacon-${id}`);
      const assignedDeacon = select ? select.value : "Deacon Thomas Reid";
      await apiFetch(`/api/calls/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedDeacon }),
      });
      showToast(`Approved and dispatched to ${assignedDeacon}. Switch to Volunteer view to verify PII masking.`);
    } else if (action === "resolve") {
      await apiFetch(`/api/calls/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      showToast("Marked complete and logged in audit trail.");
    }
    await refreshCalls();
  } catch (err) {
    showToast(err.message);
  }
});

el("btn-export-genesis").addEventListener("click", () => downloadCsv("genesis"));
el("btn-export-pco").addEventListener("click", () => downloadCsv("planning_center"));

const toggleJson = () => {
  const drawer = el("json-drawer");
  drawer.hidden = !drawer.hidden;
  if (!drawer.hidden) {
    el("json-preview").textContent = JSON.stringify(state.lastRawPayload, null, 2);
  }
};
el("btn-toggle-json").addEventListener("click", toggleJson);
el("btn-toggle-json-vol").addEventListener("click", toggleJson);
el("btn-close-json").addEventListener("click", () => { el("json-drawer").hidden = true; });

el("btn-reset-demo").addEventListener("click", async () => {
  try {
    await apiFetch("/api/demo/reset", { method: "POST" });
    await refreshCalls();
    showToast("Demo queue reset to initial synthetic Grace Harbor records.");
  } catch (err) {
    showToast(err.message);
  }
});

// Boot
async function boot() {
  try {
    const [health, meta] = await Promise.all([apiFetch("/api/health"), apiFetch("/api/meta")]);
    state.meta = meta;
    const aiLabel =
      health.aiMode === "groq_free_tier"
        ? "Groq Whisper + LLM live"
        : health.aiMode === "gemini_free_tier"
          ? "Gemini live"
          : "Deterministic local engine";
    el("console-status-line").textContent = `${meta.church.name} · ${meta.church.city} · ${aiLabel} · Synthetic Demo`;
    el("hero-sermon-title").textContent = meta.sermon.title;
    el("hero-sermon-speaker").textContent = meta.sermon.speaker;
    await refreshCalls();
  } catch (err) {
    el("console-status-line").textContent = `Backend offline: ${err.message}`;
  }

  // If opened via /judge, scroll straight to the interactive proof stage
  if (window.location.pathname === "/judge") {
    el("console").scrollIntoView({ behavior: "instant" });
  }
}

boot();
