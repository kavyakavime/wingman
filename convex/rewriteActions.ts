"use node";

/** Hour 8 — segment rewrites via Cursor Cloud REST + OpenAI fallback. */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { rewriteForSegment } from "../lib/cursorRewriteConvex";
import { computeSegmentScores } from "../lib/scoreCard";
import { pickDisplayReactions } from "../lib/swarmGraphData";
import { DEFAULT_SWARM_DRAFT } from "../lib/swarmDraft";
import { SEGMENT_ORDER, type PersonaSegment } from "../lib/segments";
import { personaSegment } from "./schema";
import {
  OpenAiApiError,
  runPersonaReaction,
} from "../lib/openai";
import { toReactionLead } from "./swarmHelpers";
import type { Doc } from "./_generated/dataModel";

type RewriteSummary = {
  segment: PersonaSegment;
  generatedVia: "cursor_sdk" | "openai_fallback";
  basedOnSignals: string[];
  preview: string;
  rewrittenDraft?: string;
  charCount?: number;
};

export const generateSegmentRewrites = action({
  args: {
    originalDraft: v.string(),
  },
  handler: async (ctx, args): Promise<{ rewrites: RewriteSummary[] }> => {
    const originalDraft = args.originalDraft.trim();
    if (!originalDraft) {
      throw new Error("Original draft cannot be empty.");
    }

    const allReactions = await ctx.runQuery(internal.agentReactions.listAllInternal, {});
    const displayReactions = pickDisplayReactions(allReactions, 2);
    const segmentScores = computeSegmentScores(displayReactions);

    const cursorApiKey = process.env.CURSOR_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!cursorApiKey && !openaiApiKey) {
      throw new Error(
        "Set CURSOR_API_KEY and/or OPENAI_API_KEY in Convex env before generating rewrites.",
      );
    }

    const rewriteResults = await Promise.all(
      SEGMENT_ORDER.map(async (segment) => {
        const score = segmentScores.find((s) => s.segment === segment);
        const topSignals = score?.topSignals ?? [];

        const result = await rewriteForSegment(
          segment,
          topSignals,
          originalDraft,
          { cursorApiKey, openaiApiKey },
        );

        return {
          segment,
          rewrittenDraft: result.rewrittenDraft,
          basedOnSignals: topSignals,
          generatedVia: result.generatedVia,
        };
      }),
    );

    await ctx.runMutation(internal.segmentRewrites.replaceAllInternal, {
      rewrites: rewriteResults,
    });

    return {
      rewrites: rewriteResults.map((r) => ({
        segment: r.segment,
        generatedVia: r.generatedVia,
        basedOnSignals: r.basedOnSignals,
        preview: r.rewrittenDraft.slice(0, 120) + (r.rewrittenDraft.length > 120 ? "…" : ""),
      })),
    };
  },
});

const EARLY_STAGE_DEPTH_INSTRUCTIONS = [
  "STRUCTURE AND DEPTH (required for this early_stage rewrite):",
  "- This is a SHORT segment-specific variant (~400–550 characters total, similar to the scaled and vertical_specialist rewrites — NOT a full-length email). Keep subject + 2–3 short paragraphs + brief CTA.",
  "- Open with a real insight about WHY zero-trust hardware security matters for early-stage robotics/security founders — use a 'not because X fails, but because Y' framing (like vertical_specialist opens with 'not because the technology fails, but because...').",
  "- Give Ian's stated concern — protecting IP and safety-critical functions via zero-trust hardware at the device layer — a full two-sentence treatment BEFORE introducing Wingman.",
  "- Do NOT collapse the pain into one flat sentence and jump to the ask.",
  "- Then pivot naturally to a brief Wingman offer/CTA. Do NOT copy the entire original draft verbatim.",
].join("\n");

export const regenerateSegmentRewrite = action({
  args: {
    segment: personaSegment,
    originalDraft: v.optional(v.string()),
    extraInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RewriteSummary> => {
    const segment = args.segment as PersonaSegment;
    const originalDraft = (args.originalDraft ?? DEFAULT_SWARM_DRAFT).trim();
    if (!originalDraft) {
      throw new Error("Original draft cannot be empty.");
    }

    const existing = await ctx.runQuery(internal.segmentRewrites.listInternal, {});
    const current = existing.find((row) => row.segment === segment);
    if (!current) {
      throw new Error(`No existing rewrite for segment: ${segment}`);
    }

    const cursorApiKey = process.env.CURSOR_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!cursorApiKey && !openaiApiKey) {
      throw new Error(
        "Set CURSOR_API_KEY and/or OPENAI_API_KEY in Convex env before regenerating.",
      );
    }

    const result = await rewriteForSegment(
      segment,
      current.basedOnSignals,
      originalDraft,
      {
        cursorApiKey,
        openaiApiKey,
        extraInstructions: args.extraInstructions,
      },
    );

    await ctx.runMutation(internal.segmentRewrites.replaceSegmentInternal, {
      segment,
      rewrittenDraft: result.rewrittenDraft,
      basedOnSignals: current.basedOnSignals,
      generatedVia: result.generatedVia,
    });

    return {
      segment,
      generatedVia: result.generatedVia,
      basedOnSignals: current.basedOnSignals,
      preview:
        result.rewrittenDraft.slice(0, 120) +
        (result.rewrittenDraft.length > 120 ? "…" : ""),
    };
  },
});

export const regenerateEarlyStageRewrite = action({
  args: {
    originalDraft: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RewriteSummary> => {
    const originalDraft = (args.originalDraft ?? DEFAULT_SWARM_DRAFT).trim();
    const existing = await ctx.runQuery(internal.segmentRewrites.listInternal, {});
    const current = existing.find((row) => row.segment === "early_stage");
    if (!current) {
      throw new Error("No existing rewrite for segment: early_stage");
    }

    const cursorApiKey = process.env.CURSOR_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!cursorApiKey && !openaiApiKey) {
      throw new Error(
        "Set CURSOR_API_KEY and/or OPENAI_API_KEY in Convex env before regenerating.",
      );
    }

    const result = await rewriteForSegment(
      "early_stage",
      current.basedOnSignals,
      originalDraft,
      {
        cursorApiKey,
        openaiApiKey,
        extraInstructions: EARLY_STAGE_DEPTH_INSTRUCTIONS,
      },
    );

    await ctx.runMutation(internal.segmentRewrites.replaceSegmentInternal, {
      segment: "early_stage",
      rewrittenDraft: result.rewrittenDraft,
      basedOnSignals: current.basedOnSignals,
      generatedVia: result.generatedVia,
    });

    return {
      segment: "early_stage",
      generatedVia: result.generatedVia,
      basedOnSignals: current.basedOnSignals,
      preview:
        result.rewrittenDraft.slice(0, 120) +
        (result.rewrittenDraft.length > 120 ? "…" : ""),
      rewrittenDraft: result.rewrittenDraft,
      charCount: result.rewrittenDraft.length,
    };
  },
});

type RetestResult = {
  personName: string;
  segment: PersonaSegment | null;
  sentiment: string;
  error: string | null;
};

export const retestRewrittenVariants = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ reactionCount: number; results: RetestResult[] }> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set in Convex env. Run: npx convex env set OPENAI_API_KEY your_key",
      );
    }

    const rewrites = await ctx.runQuery(internal.segmentRewrites.listInternal, {});
    if (rewrites.length === 0) {
      throw new Error(
        "No segment rewrites found. Run generateSegmentRewrites first.",
      );
    }

    const rewriteBySegment = new Map<PersonaSegment, string>();
    for (const row of rewrites) {
      rewriteBySegment.set(row.segment as PersonaSegment, row.rewrittenDraft);
    }

    for (const segment of SEGMENT_ORDER) {
      if (!rewriteBySegment.has(segment)) {
        throw new Error(`Missing rewrite for segment: ${segment}`);
      }
    }

    const leads: Doc<"leads">[] = await ctx.runQuery(
      internal.leads.listLockedPersonasInternal,
      {},
    );
    if (leads.length === 0) {
      throw new Error(
        "No locked demo personas found. Run seedDemo:seedLockedDemoPersonas first.",
      );
    }

    await ctx.runMutation(internal.agentReactions.clearRound3Internal, {});

    const results = await Promise.all(
      leads.map(async (lead) => {
        const personName = lead.personName ?? "Unknown";
        const segment = (lead.segment as PersonaSegment | undefined) ?? null;
        if (!segment) {
          return {
            personName,
            segment: null,
            sentiment: "objecting" as const,
            error: "Lead has no segment assignment",
          };
        }

        const draft = rewriteBySegment.get(segment);
        if (!draft?.trim()) {
          return {
            personName,
            segment,
            sentiment: "objecting" as const,
            error: `No rewrite draft for segment ${segment}`,
          };
        }

        try {
          const persona = toReactionLead(lead);
          const reaction = await runPersonaReaction(persona, draft, apiKey);

          await ctx.runMutation(internal.agentReactions.insertInternal, {
            leadId: lead._id,
            segment: persona.segment,
            sentiment: reaction.sentiment,
            reasoningText: reaction.reasoningText,
            citedSignal: reaction.citedSignal,
            round: 3,
          });

          return {
            personName,
            segment,
            sentiment: reaction.sentiment,
            error: null as string | null,
          };
        } catch (error) {
          const message =
            error instanceof OpenAiApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Unknown retest error";
          return {
            personName,
            segment,
            sentiment: "objecting" as const,
            error: message,
          };
        }
      }),
    );

    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      throw new Error(
        `Round-3 retest failed for ${failures.length} persona(s): ${failures.map((f) => `${f.personName} (${f.error})`).join("; ")}`,
      );
    }

    return {
      reactionCount: results.length,
      results,
    };
  },
});
