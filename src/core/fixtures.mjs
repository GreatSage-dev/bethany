// 100% synthetic congregation data (Rule #5 compliant — zero real congregant PII).

export const CHURCH_PROFILE = {
  id: "grace-harbor",
  name: "Grace Harbor Church",
  city: "Marietta, GA",
  phoneDisplay: "(555) 014-7720",
  phoneE164: "+15550147720",
  pastorName: "Pastor David Chen",
  onCallLabel: "Grace Harbor Care Team",
};

export const DEMO_DEACONS = [
  "Deacon Thomas Reid",
  "Deacon Hannah Morales",
  "Elder Grace Okafor",
  "Pastor David Chen",
];

export const SUNDAY_SERMON = {
  id: "sermon-2026-11-22",
  title: "You Are Not Forgotten (Psalm 23:1–4)",
  speaker: "Pastor David Chen",
  date: "2026-11-22",
  durationSeconds: 37,
  audioPath: "/api/sermon/audio",
  isSyntheticDemoAudio: true,
  transcript:
    'Good morning, Grace Harbor family. This is Pastor David sharing a short word from Sunday\'s message in Psalm 23. Even when the week feels quiet, or you cannot make it into the sanctuary, the Lord is your shepherd, and this church is still your family. "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul." If you need prayer, a grocery run, or a ride to the pharmacy this week, press 2 right now, and one of our deacons will call you back today. Grace and peace to you.',
};

export const CALLER_PRESETS = {
  martha_errand: {
    key: "martha_errand",
    label: "Martha V. — Pharmacy Ride (Contains Medical PII)",
    callerId: "caller-martha-vance",
    callerName: "Martha Vance",
    callerPhone: "(555) 014-8821",
    transcript:
      "Hello, this is Martha Vance at 418 Sycamore Lane. My hip is acting up again after Dr. Patel adjusted my lisinopril blood pressure pills, and I can't drive to Oak Street Pharmacy before Friday at 2 PM. Could someone from the church pick up my prescription? Please also pray for my surgery Tuesday.",
  },
  arthur_prayer: {
    key: "arthur_prayer",
    label: "Arthur J. — Family Travel Prayer (Elder-Only)",
    callerId: "caller-arthur-jenkins",
    callerName: "Arthur Jenkins",
    callerPhone: "(555) 014-3319",
    transcript:
      "Hi Pastor David, this is Arthur Jenkins. Thank you for Sunday's message on Psalm 23. My daughter Claire is flying in Thursday evening and I would love the elders to pray for safe travels and peace over our family.",
  },
  evelyn_urgent: {
    key: "evelyn_urgent",
    label: "Evelyn B. — Urgent Distress & Fall (Crisis Gate)",
    callerId: "caller-evelyn-brooks",
    callerName: "Evelyn Brooks",
    callerPhone: "(555) 014-9904",
    transcript:
      "Hello? Is anyone at the church office? I fell in the hallway trying to reach the phone and my chest hurts. I feel completely alone and don't want to keep going anymore.",
  },
};

export const SEED_CALL_INPUTS = [
  {
    id: "call-seed-001",
    callerId: "caller-walter-simmons",
    callerName: "Walter Simmons",
    callerPhone: "(555) 014-4410",
    transcript:
      "Hi church, Walter Simmons here from 209 Elmwood Drive. Since my cataract surgery my eyes aren't up for driving. Could a volunteer drop off groceries from Trader Joe's on Thursday morning at 10 AM?",
    preApprove: {
      assignedDeacon: "Deacon Thomas Reid",
      approvedBy: "Pastor David Chen",
    },
    createdAt: "2026-11-25T14:20:00.000Z",
  },
  {
    id: "call-seed-002",
    callerId: CALLER_PRESETS.arthur_prayer.callerId,
    callerName: CALLER_PRESETS.arthur_prayer.callerName,
    callerPhone: CALLER_PRESETS.arthur_prayer.callerPhone,
    transcript: CALLER_PRESETS.arthur_prayer.transcript,
    preApprove: null,
    createdAt: "2026-11-25T16:45:00.000Z",
  },
  {
    id: "call-seed-003",
    callerId: CALLER_PRESETS.martha_errand.callerId,
    callerName: CALLER_PRESETS.martha_errand.callerName,
    callerPhone: CALLER_PRESETS.martha_errand.callerPhone,
    transcript: CALLER_PRESETS.martha_errand.transcript,
    preApprove: null,
    createdAt: "2026-11-26T09:10:00.000Z",
  },
];
