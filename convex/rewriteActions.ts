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
  runPeerInfluenceReaction,
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
    leadIds: v.optional(v.array(v.id("leads"))),
  },
  handler: async (ctx, args): Promise<{ rewrites: RewriteSummary[] }> => {
    const originalDraft = args.originalDraft.trim();
    if (!originalDraft) {
      throw new Error("Original draft cannot be empty.");
    }

    let allReactions = await ctx.runQuery(internal.agentReactions.listAllInternal, {});
    if (args.leadIds && args.leadIds.length > 0) {
      const idSet = new Set(args.leadIds);
      allReactions = allReactions.filter((r) => idSet.has(r.leadId));
    }
    const displayReactions = pickDisplayReactions(allReactions, 2);
    const segmentScores = computeSegmentScores(displayReactions);
    const segmentsToRewrite = SEGMENT_ORDER.filter((segment) => {
      const score = segmentScores.find((entry) => entry.segment === segment);
      return (score?.personaCount ?? 0) > 0;
    });

    if (segmentsToRewrite.length === 0) {
      throw new Error(
        "No swarm reactions found for the selected leads. Run the simulation first, then click Fix it.",
      );
    }

    const cursorApiKey = process.env.CURSOR_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!cursorApiKey && !openaiApiKey) {
      throw new Error(
        "Set OPENAI_API_KEY (recommended) or CURSOR_API_KEY in Convex env before generating rewrites.",
      );
    }

    const rewriteResults = await Promise.all(
      segmentsToRewrite.map(async (segment) => {
        const score = segmentScores.find((entry) => entry.segment === segment);
        const topSignals = score?.topSignals ?? [];
        const objections = score?.objections ?? [];
        const dominantSentiment = score?.dominantSentiment ?? null;

        const result = await rewriteForSegment(
          segment,
          topSignals,
          originalDraft,
          { cursorApiKey, openaiApiKey, dominantSentiment, objections },
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
  "Give the segment's top cited pain a full two-sentence treatment BEFORE introducing the product.",
  "Use a 'not because X fails, but because Y' framing in the opening if it fits naturally.",
  "Do NOT collapse the pain into one flat sentence and jump to the ask.",
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
  args: {
    leadIds: v.optional(v.array(v.id("leads"))),
  },
  handler: async (
    ctx,
    args,
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

    let leads: Doc<"leads">[];
    if (args.leadIds && args.leadIds.length > 0) {
      leads = await ctx.runQuery(internal.leads.getLeadsByIdsInternal, {
        leadIds: args.leadIds,
      });
      if (leads.length === 0) {
        throw new Error("No leads found for the provided leadIds.");
      }
    } else {
      leads = await ctx.runQuery(internal.leads.listLockedPersonasInternal, {});
      if (leads.length === 0) {
        throw new Error(
          "No locked demo personas found. Run seedDemo:seedLockedDemoPersonas first.",
        );
      }
    }

    const segmentsNeeded = new Set<PersonaSegment>();
    for (const lead of leads) {
      const segment = toReactionLead(lead).segment;
      if (segment) segmentsNeeded.add(segment);
    }

    for (const segment of segmentsNeeded) {
      if (!rewriteBySegment.has(segment)) {
        throw new Error(
          `Missing rewrite for segment: ${segment}. Run Fix it after the baseline swarm completes.`,
        );
      }
    }

    const leadIds = leads.map((lead) => lead._id);
    await ctx.runMutation(internal.agentReactions.clearRound3ForLeadIdsInternal, {
      leadIds,
    });

    type InitialReaction = {
      lead: Doc<"leads">;
      persona: ReturnType<typeof toReactionLead>;
      draft: string;
      reaction: Awaited<ReturnType<typeof runPersonaReaction>>;
    };

    const initialResults: InitialReaction[] = await Promise.all(
      leads.map(async (lead) => {
        const persona = toReactionLead(lead);
        const segment = persona.segment;
        if (!segment) {
          throw new Error(`Lead ${lead.personName ?? lead._id} has no segment assignment`);
        }
        const draft = rewriteBySegment.get(segment)?.trim();
        if (!draft) {
          throw new Error(`No rewrite draft for segment ${segment}`);
        }
        const reaction = await runPersonaReaction(persona, draft, apiKey);
        return { lead, persona, draft, reaction };
      }),
    );

    const results = await Promise.all(
      initialResults.map(async ({ lead, persona, draft, reaction: ownInitial }) => {
        const personName = lead.personName ?? "Unknown";
        const segment = persona.segment ?? null;

        try {
          const peers = initialResults
            .filter((row) => row.lead._id !== lead._id)
            .map((row) => ({
              personName: row.persona.personName,
              sentiment: row.reaction.sentiment,
              citedSignal: row.reaction.citedSignal,
              reasoningText: row.reaction.reasoningText,
            }));

          const reaction = await runPeerInfluenceReaction(
            persona,
            draft,
            ownInitial,
            peers,
            apiKey,
          );

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
