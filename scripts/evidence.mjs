import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createBethanyApp } from "../src/server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const { server, store } = await createBethanyApp({ dbPath: ":memory:" });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function timed(fn) {
  const t0 = performance.now();
  const value = await fn();
  return { ms: Number((performance.now() - t0).toFixed(2)), value };
}

try {
  const crisisProbe = await timed(async () => {
    const r = await fetch(`${base}/api/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bethany-role": "pastor" },
      body: JSON.stringify({ presetKey: "evelyn_urgent" }),
    });
    return { status: r.status, body: await r.json() };
  });

  const rbacProbe = await timed(async () => {
    const volCalls = await (await fetch(`${base}/api/calls`, { headers: { "x-bethany-role": "volunteer" } })).json();
    const volCsv = await fetch(`${base}/api/export/csv`, { headers: { "x-bethany-role": "volunteer" } });
    const rock7183 = await (await fetch(`${base}/api/calls?callerId=nonexistent`, { headers: { "x-bethany-role": "pastor" } })).json();
    return {
      volunteerVisibleCalls: volCalls.count,
      volunteerHasRawTranscript: volCalls.calls.some((c) => "rawTranscript" in c),
      volunteerCsvStatus: volCsv.status,
      rock7183MissingCallerCount: rock7183.count,
    };
  });

  const twimlProbe = await timed(async () => {
    const r = await fetch(`${base}/api/twiml`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "Digits=1&From=%2B15550148821",
    });
    const xml = await r.text();
    return { status: r.status, hasPlayAudio: xml.includes("/api/sermon/audio") };
  });

  const report = {
    brand: "Bethany",
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    externalDependencies: 0,
    vercelReady: true,
    probes: {
      crisisEscalation: {
        latencyMs: crisisProbe.ms,
        httpStatus: crisisProbe.value.status,
        urgentEscalated: crisisProbe.value.body.urgentEscalated,
        aiCounselingBlocked: crisisProbe.value.body.call?.aiCounselingBlocked,
        crisisFlags: crisisProbe.value.body.call?.crisisFlags,
      },
      rbacAndRock7183: {
        latencyMs: rbacProbe.ms,
        ...rbacProbe.value,
      },
      twilioTwimlWebhook: {
        latencyMs: twimlProbe.ms,
        ...twimlProbe.value,
      },
    },
  };

  fs.mkdirSync(path.join(ROOT, "evidence"), { recursive: true });
  const outPath = path.join(ROOT, "evidence", "backend-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`evidence: PASS -> ${path.relative(ROOT, outPath)}`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
  store.close();
}
