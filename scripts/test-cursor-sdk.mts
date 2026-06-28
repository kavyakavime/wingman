/**
 * Smoke-test the @cursor/sdk rewrite path (not the Convex REST shim).
 * Usage: CURSOR_API_KEY=... npx tsx scripts/test-cursor-sdk.mts
 */
import { rewriteForSegment } from "../lib/cursorSdk.js";
import { DEFAULT_SWARM_DRAFT } from "../lib/swarmDraft.js";

const apiKey = process.env.CURSOR_API_KEY;
if (!apiKey) {
  console.error("Set CURSOR_API_KEY to test the Cursor SDK path.");
  process.exit(1);
}

const topSignals = [
  "Zero-trust hardware security is our entire thesis — generic pilot outreach misses that.",
];

console.log("Testing @cursor/sdk Agent.create path for early_stage segment…");

const result = await rewriteForSegment(
  "early_stage",
  topSignals,
  DEFAULT_SWARM_DRAFT,
  { cursorApiKey: apiKey, openaiApiKey: undefined },
);

console.log("\n--- generatedVia ---");
console.log(result.generatedVia);
console.log("\n--- rewritten draft (first 500 chars) ---");
console.log(result.rewrittenDraft.slice(0, 500));
console.log(result.rewrittenDraft.length > 500 ? "…" : "");

if (result.generatedVia !== "cursor_sdk") {
  console.error("\nFAIL: expected cursor_sdk path, got fallback.");
  process.exit(2);
}

console.log("\nOK: Cursor SDK path returned a real rewrite.");
