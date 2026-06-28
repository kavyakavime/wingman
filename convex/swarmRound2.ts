"use node";

import {
  OpenAiApiError,
  runPeerInfluenceReaction,
  type PeerRound1Summary,
} from "../lib/openai";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { PersonaSegment } from "../lib/segments";
import { toReactionLead } from "./swarmHelpers";

type Round2Result = {
  personName: string;
  segment: PersonaSegment | null;
  sentiment: string;
  reasoningText: string;
  citedSignal: string;
  error: string | null;
};

/**
 * Hour 6.5 — after round 1 completes, each persona re-evaluates with peer summaries.
 * Writes round: 2 rows; round 1 records stay intact.
 */
export async function runPeerInfluenceRound(
  ctx: ActionCtx,
  args: {
    leads: Doc<"leads">[];
    draftMessage: string;
    apiKey: string;
  },
): Promise<Round2Result[]> {
  const { leads, draftMessage, apiKey } = args;
  const leadIds = leads.map((lead) => lead._id);

  const allReactions = await ctx.runQuery(
    internal.agentReactions.listForLeadIdsInternal,
    { leadIds },
  );

  const round1ByLead = new Map<
    Id<"leads">,
    {
      sentiment: "positive" | "neutral" | "objecting";
      reasoningText: string;
      citedSignal: string;
      personName: string;
      segment?: PersonaSegment;
    }
  >();

  for (const row of allReactions) {
    if (row.round === 1) {
      round1ByLead.set(row.leadId, {
        sentiment: row.sentiment,
        reasoningText: row.reasoningText,
        citedSignal: row.citedSignal,
        personName: row.personName,
        segment: row.segment as PersonaSegment | undefined,
      });
    }
  }

  const results = await Promise.all(
    leads.map(async (lead) => {
      const personName = lead.personName ?? "Unknown";
      const ownRound1 = round1ByLead.get(lead._id);

      if (!ownRound1) {
        return {
          personName,
          segment: (lead.segment as PersonaSegment | undefined) ?? null,
          sentiment: "objecting" as const,
          reasoningText: "",
          citedSignal: "",
          error: "Missing round 1 reaction for peer-influence pass.",
        };
      }

      try {
        const persona = toReactionLead(lead);
        const peers: PeerRound1Summary[] = [...round1ByLead.entries()]
          .filter(([leadId]) => leadId !== lead._id)
          .map(([, reaction]) => ({
            personName: reaction.personName,
            sentiment: reaction.sentiment,
            citedSignal: reaction.citedSignal,
            reasoningText: reaction.reasoningText,
          }));

        const reaction = await runPeerInfluenceReaction(
          persona,
          draftMessage,
          {
            sentiment: ownRound1.sentiment,
            reasoningText: ownRound1.reasoningText,
            citedSignal: ownRound1.citedSignal,
          },
          peers,
          apiKey,
        );

        await ctx.runMutation(internal.agentReactions.insertInternal, {
          leadId: lead._id,
          segment: persona.segment,
          sentiment: reaction.sentiment,
          reasoningText: reaction.reasoningText,
          citedSignal: reaction.citedSignal,
          round: 2,
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
              : "Unknown round 2 error";
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
      `Round 2 failed for ${failures.length} persona(s): ${failures.map((f) => `${f.personName} (${f.error})`).join("; ")}`,
    );
  }

  return results;
}
