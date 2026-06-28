"use node";

import { v } from "convex/values";
import { logoUrlForCompany } from "../lib/companyLogo";
import { enrichLeadWithFiberAndOrangeSlice } from "../lib/enrichLead";
import { FiberApiError } from "../lib/fiber";
import { OrangeSliceApiError } from "../lib/orangeslice";
import { logOrangeSlice } from "../lib/orangeSliceLog";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function enrichLeadBatch(
  ctx: ActionCtx,
  leadIds: Id<"leads">[],
  orangeKey: string | undefined,
  fiberKey: string | undefined,
): Promise<{ enrichedCount: number; leadIds: Id<"leads">[] }> {
  if (!orangeKey) {
    const message = "ORANGESLICE_API_KEY is not set in Convex env.";
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

  try {
    for (const leadId of leadIds) {
      await ctx.runMutation(internal.leads.setLeadEnrichmentLoading, { leadId });

      const lead = await ctx.runQuery(internal.leads.getLeadInternal, { leadId });
      if (!lead) continue;

      const linkedinUrl = lead.linkedinUrl;
      if (!linkedinUrl) {
        await ctx.runMutation(internal.leads.applyLeadEnrichment, {
          leadId,
          activitySource: "none",
          enrichmentError: "No LinkedIn URL on this lead — run audience search first.",
        });
        continue;
      }

      try {
        const enrichment = await enrichLeadWithFiberAndOrangeSlice(
          {
            personName: lead.personName,
            companyName: lead.companyName,
            role: lead.role,
            socialSignal: lead.socialSignal,
            linkedinUrl,
            locality: lead.locality,
          },
          orangeKey,
          fiberKey,
        );

        logOrangeSlice("enrichLead (Fiber + Orange Slice)", {
          leadId,
          linkedinUrl,
          fiberSignal: enrichment.fiberSignal,
          painSignal: enrichment.painSignal,
          recentActivity: enrichment.recentActivity,
        });

        const activitySource =
          enrichment.fiberSignalSource && enrichment.fiberSignalSource !== "none"
            ? enrichment.fiberSignalSource
            : enrichment.recentActivity
              ? "latest_activities"
              : "none";

        await ctx.runMutation(internal.leads.applyLeadEnrichment, {
          leadId,
          recentActivity: enrichment.recentActivity ?? undefined,
          activitySource,
          painSignal: enrichment.painSignal ?? undefined,
          fundingStage: enrichment.fundingStage ?? undefined,
          intentScore: enrichment.intentScore ?? undefined,
          fiberSignal: enrichment.fiberSignal ?? undefined,
          fiberSignalKind: enrichment.fiberSignalKind ?? undefined,
          fiberSignalSource:
            enrichment.fiberSignalSource && enrichment.fiberSignalSource !== "none"
              ? enrichment.fiberSignalSource
              : undefined,
          personName: enrichment.personName ?? undefined,
          role: enrichment.role ?? undefined,
          companyName: enrichment.companyName ?? undefined,
          locality: enrichment.locality ?? undefined,
          companyLogoUrl:
            logoUrlForCompany(
              enrichment.companyName ?? lead.companyName,
              enrichment.companyLogoUrl ?? lead.companyLogoUrl,
            ) ?? undefined,
          companyLinkedinUrl:
            enrichment.companyLinkedinUrl ?? lead.companyLinkedinUrl ?? undefined,
        });

        enrichedCount += 1;
      } catch (error) {
        const message =
          error instanceof OrangeSliceApiError || error instanceof FiberApiError
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
  } finally {
    await ctx.runMutation(internal.leads.finalizeEnrichmentBatch, {
      leadIds,
      errorMessage: "Enrichment timed out or was interrupted before this lead finished.",
    });
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
      process.env.ORANGESLICE_API_KEY,
      process.env.FIBER_API_KEY,
    );
  },
});

/** Enrich leads with Fiber live LinkedIn activity + Orange Slice pain/funding signals. */
export const enrichLeads = action({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args): Promise<{ enrichedCount: number; leadIds: Id<"leads">[] }> => {
    if (args.leadIds.length === 0) {
      throw new Error("No leads selected for enrichment.");
    }
    return enrichLeadBatch(
      ctx,
      args.leadIds,
      process.env.ORANGESLICE_API_KEY,
      process.env.FIBER_API_KEY,
    );
  },
});
