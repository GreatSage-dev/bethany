// Vercel Node.js Function entrypoint (Fluid Compute, Node 24 LTS).
// Lazy singleton avoids re-seeding on warm invocations and uses Upstash Redis or /tmp safely.

import { createBethanyApp } from "../src/server.mjs";

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = createBethanyApp();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const { handler: bethanyHandler } = await getApp();
  return bethanyHandler(req, res);
}
