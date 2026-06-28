"use node";

import { v } from "convex/values";
import { FiberApiError, getLatestActivity } from "../lib/fiber";
import { OrangeSliceApiError, enrichPersona } from "../lib/orangeslice";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function enrichLeadBatch(
  ctx: ActionCtx,
  leadIds: Id<"leads">[],
  fiberKey: string | undefined,
  orangeKey: string | undefined,
): Promise<{ enrichedCount: number; leadIds: Id<"leads">[] }> {
  if (!fiberKey || !orangeKey) {
    const message = !fiberKey
      ? "FIBER_API_KEY is not set in Convex env."
      : "ORANGESLICE_API_KEY is not set in Convex env.";
    for (const leadId of leadIds) {
      await ctx.runMutation(internal.leads.applyLeadEnrichment, {
        leadId,
        activitySource: "none",
        enrichmentError: message,
      });
    }
    return { enrichedCount: 0, leadIds };
  }

  let enrichedCount = 0;

  for (const leadId of leadIds) {
    await ctx.runMutation(internal.leads.setLeadEnrichmentLoading, { leadId });

    const lead = await ctx.runQuery(internal.leads.getLeadInternal, { leadId });
    if (!lead) continue;

    const linkedinUrl = lead.linkedinUrl;
    if (!linkedinUrl) {
      await ctx.runMutation(internal.leads.applyLeadEnrichment, {
        leadId,
        activitySource: "none",
        enrichmentError: "No LinkedIn URL on this lead — run Fiber search first.",
      });
      continue;
    }

    try {
      const activity = await getLatestActivity(linkedinUrl, fiberKey);

      const enrichment = await enrichPersona(
        {
          personName: lead.personName,
          companyName: lead.companyName,
          role: lead.role,
          socialSignal: lead.socialSignal,
          linkedinUrl,
          locality: lead.locality,
          recentActivity: activity.recentActivity,
        },
        orangeKey,
      );

      await ctx.runMutation(internal.leads.applyLeadEnrichment, {
        leadId,
        recentActivity: activity.recentActivity ?? undefined,
        activitySource: activity.activitySource,
        fundingStage: enrichment.fundingStage ?? undefined,
        painSignal: enrichment.painSignal ?? undefined,
        intentScore: enrichment.intentScore ?? undefined,
      });

      enrichedCount += 1;
    } catch (error) {
      const message =
        error instanceof FiberApiError || error instanceof OrangeSliceApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown enrichment error";

      await ctx.runMutation(internal.leads.applyLeadEnrichment, {
        leadId,
        activitySource: "none",
        enrichmentError: message,
      });
    }
  }

  return { enrichedCount, leadIds };
}

export const enrichLockedPersonas = action({
  args: {},
  handler: async (ctx): Promise<{ enrichedCount: number; leadIds: Id<"leads">[] }> => {
    const leadIds = await ctx.runMutation(internal.leads.ensureLockedDemoLeads, {});
    return enrichLeadBatch(
      ctx,
      leadIds,
      process.env.FIBER_API_KEY,
      process.env.ORANGESLICE_API_KEY,
    );
  },
});

/** Enrich Fiber audience leads from an audience run (batch). */
export const enrichLeads = action({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args): Promise<{ enrichedCount: number; leadIds: Id<"leads">[] }> => {
    if (args.leadIds.length === 0) {
      throw new Error("No leads selected for enrichment.");
    }
    return enrichLeadBatch(
      ctx,
      args.leadIds,
      process.env.FIBER_API_KEY,
      process.env.ORANGESLICE_API_KEY,
    );
  },
});
