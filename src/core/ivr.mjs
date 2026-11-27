// Unified telephony state machine driving BOTH real Twilio Voice webhooks (TwiML XML)
// and the zero-signup browser Touch-Tone handset.

import crypto from "node:crypto";
import { CHURCH_PROFILE, SUNDAY_SERMON } from "./fixtures.mjs";

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function computeTwilioSignature(authToken, fullUrl, params = {}) {
  const keys = Object.keys(params).sort();
  let payload = String(fullUrl);
  for (const k of keys) {
    payload += k + String(params[k] ?? "");
  }
  return crypto.createHmac("sha1", String(authToken)).update(payload, "utf8").digest("base64");
}

export function verifyTwilioSignature({ authToken, fullUrl, params, headerSignature }) {
  // shortcut: signature verification runs automatically whenever TWILIO_AUTH_TOKEN is configured; unset in local demo mode.
  if (!authToken) return true;
  if (!headerSignature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, fullUrl, params), "utf8");
  const provided = Buffer.from(String(headerSignature), "utf8");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

function normalizeSpokenOrKeypadInput(raw = "") {
  const cleaned = String(raw || "").trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (!cleaned || cleaned === "menu" || cleaned === "*") return "";
  if (cleaned === "1" || /\b(one|sermon|message|pastor|sunday)\b/.test(cleaned)) return "1";
  if (cleaned === "2" || /\b(two|prayer|need|errand|help|ride|visit|deacon)\b/.test(cleaned)) return "2";
  if (cleaned === "0" || /\b(zero|operator|urgent|emergency|crisis)\b/.test(cleaned)) return "0";
  return String(raw || "").trim();
}

export function resolveIvrStep(digitRaw = "") {
  const digit = normalizeSpokenOrKeypadInput(digitRaw);

  if (digit === "" || digit === "menu") {
    return {
      step: "menu",
      digit: "",
      spokenText: `Welcome to ${CHURCH_PROFILE.name}. Press 1 to hear ${SUNDAY_SERMON.speaker}'s Sunday message. Press 2 to leave a prayer request or ask for help. Press 0 for urgent pastoral care.`,
      audioUrl: null,
      gatherDigits: 1,
      expectsRecording: false,
      urgentTransfer: false,
    };
  }

  if (digit === "1") {
    return {
      step: "sermon_playback",
      digit: "1",
      spokenText: `Playing ${SUNDAY_SERMON.speaker}'s message: ${SUNDAY_SERMON.title}. Press 2 afterward to leave a prayer or errand request.`,
      audioUrl: SUNDAY_SERMON.audioPath,
      gatherDigits: 1,
      expectsRecording: false,
      urgentTransfer: false,
    };
  }

  if (digit === "2") {
    return {
      step: "record_need",
      digit: "2",
      spokenText:
        "Please say your name and share your prayer request or practical need after the tone. A pastor or deacon will review your message personally.",
      audioUrl: null,
      gatherDigits: 0,
      expectsRecording: true,
      urgentTransfer: false,
    };
  }

  if (digit === "0") {
    return {
      step: "urgent_care",
      digit: "0",
      spokenText:
        "If this is a medical emergency, please hang up and dial 9 1 1. If you are in emotional distress, dial 9 8 8. We have alerted the on-call pastor at Grace Harbor Church to call you back right away.",
      audioUrl: null,
      gatherDigits: 0,
      expectsRecording: false,
      urgentTransfer: true,
    };
  }

  return {
    step: "invalid_digit",
    digit,
    spokenText: `Sorry, "${digit}" is not an option. Press 1 for Sunday's message, 2 to leave a prayer or errand request, or 0 for urgent pastoral care.`,
    audioUrl: null,
    gatherDigits: 1,
    expectsRecording: false,
    urgentTransfer: false,
  };
}

export function renderTwiml(ivrState, baseUrl = "") {
  const cleanBase = String(baseUrl || "").replace(/\/$/, "");
  const actionUrl = `${cleanBase}/api/twiml`;
  const gatherAttrs = `numDigits="1" input="dtmf speech" speechTimeout="auto" hints="one, two, zero, sermon, prayer, help, urgent" action="${xmlEscape(actionUrl)}" method="POST" timeout="8"`;
  const say = (text) => `<Say voice="Polly.Joanna">${xmlEscape(text)}</Say>`;

  if (ivrState.step === "sermon_playback") {
    const audioFull = `${cleanBase}${ivrState.audioUrl}`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  <Play>${xmlEscape(audioFull)}</Play>`,
      `  <Gather ${gatherAttrs}>`,
      `    ${say("Press or say 2 to leave a prayer or errand request, or 1 to hear the message again.")}`,
      "  </Gather>",
      `  ${say("God bless you. Goodbye.")}`,
      "</Response>",
    ].join("\n");
  }

  if (ivrState.step === "record_need") {
    const recordAction = `${cleanBase}/api/twiml?step=recorded`;
    const transcribeCallback = `${cleanBase}/api/twiml?step=transcribed`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  ${say(ivrState.spokenText)}`,
      `  <Record action="${xmlEscape(recordAction)}" method="POST" maxLength="120" playBeep="true" transcribe="true" transcribeCallback="${xmlEscape(transcribeCallback)}" />`,
      `  ${say("We did not hear a recording. Please call back anytime.")}`,
      "</Response>",
    ].join("\n");
  }

  if (ivrState.step === "urgent_care") {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  ${say(ivrState.spokenText)}`,
      "</Response>",
    ].join("\n");
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Gather ${gatherAttrs}>`,
    `    ${say(ivrState.spokenText)}`,
    "  </Gather>",
    `  ${say("We did not receive a selection. Please call Grace Harbor Church again anytime.")}`,
    "</Response>",
  ].join("\n");
}
