/**
 * Convex-safe entry: Cursor Cloud REST + OpenAI fallback.
 * @cursor/sdk cannot bundle inside Convex actions — this uses the same Cloud
 * Agents API that Agent.create({ cloud: {} }) calls under the hood.
 */

import { rewriteForSegmentWithCursorFn } from "./cursorRewriteShared";
import { rewriteViaCursorCloudRest } from "./cursorCloudRest";
import type { PersonaSegment } from "./segments";
import type { RewriteForSegmentResult } from "./cursorRewriteShared";
import type { SegmentObjection } from "./scoreCard";

export type { RewriteForSegmentResult, RewriteGeneratedVia } from "./cursorRewriteShared";

export async function rewriteForSegment(
  segment: PersonaSegment,
  topSignals: string[],
  originalDraft: string,
  options?: {
    cursorApiKey?: string;
    openaiApiKey?: string;
    extraInstructions?: string;
    dominantSentiment?: import("./swarmGraphData").SwarmSentiment | null;
    objections?: SegmentObjection[];
  },
): Promise<RewriteForSegmentResult> {
  return rewriteForSegmentWithCursorFn(
    segment,
    topSignals,
    originalDraft,
    rewriteViaCursorCloudRest,
    options,
  );
}
