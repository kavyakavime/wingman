/**
 * Cursor SDK (@cursor/sdk) — segment-specific draft rewrites via Composer 2.
 * Used from local scripts/tests. Convex actions use lib/cursorRewriteConvex.ts
 * (same Cloud Agents API; @cursor/sdk does not bundle in Convex).
 */

import { Agent } from "@cursor/sdk";
import {
  rewriteForSegmentWithCursorFn,
  type RewriteForSegmentResult,
} from "./cursorRewriteShared";
import type { PersonaSegment } from "./segments";

export type { RewriteForSegmentResult, RewriteGeneratedVia } from "./cursorRewriteShared";

async function rewriteViaCursorSdkAgent(prompt: string, apiKey: string): Promise<string> {
  await using agent = await Agent.create({
    apiKey,
    model: { id: "composer-2" },
    cloud: {},
    name: "wingman-segment-rewrite",
  });

  const run = await agent.send(prompt);
  const result = await run.wait();

  if (result.status === "error") {
    throw new Error(`Cursor agent run failed (run ${result.id})`);
  }

  const text = result.result?.trim();
  if (!text) {
    throw new Error("Cursor agent returned empty rewrite");
  }

  return text;
}

/**
 * Rewrite the draft for one segment using @cursor/sdk Agent.create.
 * Tries Cursor SDK first; falls back to GPT-4o on throw/timeout.
 */
export async function rewriteForSegment(
  segment: PersonaSegment,
  topSignals: string[],
  originalDraft: string,
  options?: {
    cursorApiKey?: string;
    openaiApiKey?: string;
    extraInstructions?: string;
  },
): Promise<RewriteForSegmentResult> {
  return rewriteForSegmentWithCursorFn(
    segment,
    topSignals,
    originalDraft,
    rewriteViaCursorSdkAgent,
    options,
  );
}
