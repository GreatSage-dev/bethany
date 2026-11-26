// Vercel Node.js Function entrypoint (Fluid Compute, Node 24 LTS, native ESM via package.json "type": "module").
// Lazy singleton avoids re-seeding on warm invocations and uses Upstash Redis or /tmp safely.

import { createBethanyApp } from "../src/server.mjs";

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = createBethanyApp();
  }
  return appPromise;
}

export function normalizeVercelRewriteUrl(rawUrl = "/") {
  const parsed = new URL(rawUrl, "http://localhost");
  const rewrittenPath = parsed.searchParams.get("__path");
  if (rewrittenPath === null) return rawUrl;

  parsed.searchParams.delete("__path");
  const targetPath =
    parsed.pathname === "/api/index" || parsed.pathname === "/api"
      ? `/api/${rewrittenPath.replace(/^\/+/, "")}`
      : parsed.pathname;
  const qs = parsed.searchParams.toString();
  return qs ? `${targetPath}?${qs}` : targetPath;
}

export default async function handler(req, res) {
  req.url = normalizeVercelRewriteUrl(req.url || "/");
  const { handler: bethanyHandler } = await getApp();
  return bethanyHandler(req, res);
}
