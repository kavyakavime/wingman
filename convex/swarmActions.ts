"use node";

import {
  OpenAiApiError,
  runPersonaReaction,
} from "../lib/openai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { PersonaSegment } from "../lib/segments";
import { toReactionLead } from "./swarmHelpers";
import { runPeerInfluenceRound } from "./swarmRound2";

type SwarmResult = {
  personName: string;
  segment: PersonaSegment | null;
  sentiment: string;
  reasoningText: string;
  citedSignal: string;
  error: string | null;
};

export const runSwarm = action({
  args: {
    draftMessage: v.string(),
    leadIds: v.optional(v.array(v.id("leads"))),
    includeRound2: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    reactionCount: number;
    round2ReactionCount: number;
    results: SwarmResult[];
  }> => {
    const includeRound2 = args.includeRound2 ?? true;
    const draftMessage = args.draftMessage.trim();
    if (!draftMessage) {
      throw new Error("Draft message cannot be empty.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set in Convex env. Run: npx convex env set OPENAI_API_KEY your_key",
      );
    }

    let leads: Doc<"leads">[];

    if (args.leadIds && args.leadIds.length > 0) {
      leads = await ctx.runQuery(internal.leads.getLeadsByIdsInternal, {
        leadIds: args.leadIds,
      });
      if (leads.length === 0) {
        throw new Error("No leads found for the provided leadIds.");
      }
      await ctx.runMutation(internal.agentReactions.clearForLeadIdsInternal, {
        leadIds: args.leadIds,
      });
    } else {
      leads = await ctx.runQuery(internal.leads.listLockedPersonasInternal, {});
      if (leads.length === 0) {
        throw new Error(
          "No locked demo personas found. Run seedDemo:seedLockedDemoPersonas first.",
        );
      }
      await ctx.runMutation(internal.agentReactions.clearAllInternal, {});
    }

    const results = await Promise.all(
      leads.map(async (lead) => {
        const personName = lead.personName ?? "Unknown";
        try {
          const persona = toReactionLead(lead);
          const reaction = await runPersonaReaction(persona, draftMessage, apiKey);

          await ctx.runMutation(internal.agentReactions.insertInternal, {
            leadId: lead._id,
            segment: persona.segment,
            sentiment: reaction.sentiment,
            reasoningText: reaction.reasoningText,
            citedSignal: reaction.citedSignal,
          });

          return {
            personName: persona.personName,
            segment: persona.segment ?? null,
            sentiment: reaction.sentiment,
            reasoningText: reaction.reasoningText,
            citedSignal: reaction.citedSignal,
            error: null as string | null,
          };
        } catch (error) {
          const message =
            error instanceof OpenAiApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Unknown swarm error";
          return {
            personName,
            segment: (lead.segment as PersonaSegment | undefined) ?? null,
            sentiment: "objecting" as const,
            reasoningText: "",
            citedSignal: "",
            error: message,
          };
        }
      }),
    );

    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      throw new Error(
        `Swarm failed for ${failures.length} persona(s): ${failures.map((f) => `${f.personName} (${f.error})`).join("; ")}`,
      );
    }

    let round2Results: Awaited<ReturnType<typeof runPeerInfluenceRound>> = [];
    if (includeRound2) {
      round2Results = await runPeerInfluenceRound(ctx, {
        leads,
        draftMessage,
        apiKey,
      });
    }

    return {
      reactionCount: results.length,
      round2ReactionCount: round2Results.length,
      results,
    };
  },
});
