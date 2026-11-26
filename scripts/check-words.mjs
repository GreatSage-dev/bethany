import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BANNED = [
  "seamless",
  "seamlessly",
  "robust",
  "revolutionize",
  "revolutionary",
  "empower",
  "empowering",
  "leverage",
  "leveraging",
  "orchestrate",
  "trustless",
  "cutting-edge",
  "next-gen",
  "game-changer",
  "game-changing",
  "synergy",
  "paradigm",
  "holistic",
  "hyper-scalable",
  "democratize",
  "unleash",
  "transformative",
  "state-of-the-art",
];

const targets = ["AGENTS.md", "docs/PLAN.md", "README.md", "AUDIT.md", "CONTRIBUTING.md"]
  .map((rel) => path.join(ROOT, rel))
  .filter((abs) => fs.existsSync(abs));

const violations = [];
for (const file of targets) {
  const text = fs.readFileSync(file, "utf8");
  for (const word of BANNED) {
    if (new RegExp(`\\b${word.replace("-", "[- ]?")}\\b`, "i").test(text)) {
      violations.push(`${path.relative(ROOT, file)}: banned buzzword "${word}"`);
    }
  }
}

if (violations.length > 0) {
  console.error("check:words FAIL:\n  " + violations.join("\n  "));
  process.exit(1);
}
console.log(`check:words PASS (${targets.length} docs checked, 0 banned buzzwords)`);
