import assert from "node:assert/strict";
import { createBethanyApp } from "../src/server.mjs";

const { server, store } = await createBethanyApp({ dbPath: ":memory:" });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.service, "bethany-backend");
  assert.equal(health.audioReady, true);

  const meta = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(meta.brand.name, "Bethany");

  const dtmf = await (
    await fetch(`${base}/api/simulate/dtmf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digit: "1" }),
    })
  ).json();
  assert.equal(dtmf.step, "sermon_playback");

  const vol = await (await fetch(`${base}/api/calls`)).json();
  assert.equal(vol.role, "volunteer");
  assert.equal(vol.count, 1);

  const pastor = await (await fetch(`${base}/api/calls`, { headers: { "x-bethany-role": "pastor" } })).json();
  assert.equal(pastor.count, 3);

  console.log(
    `smoke: PASS (Bethany health ok, persistence=${health.persistenceMode}, audio ready, volunteer=${vol.count}, pastor=${pastor.count})`
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  store.close();
}
