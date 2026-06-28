"use node";

import { FiberApiError, searchAudience } from "../lib/fiber";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const fetchAudience = action({
  args: {
    runId: v.id("audienceRuns"),
    icp: v.string(),
  },
  handler: async (ctx, args): Promise<{ runId: Id<"audienceRuns"> }> => {
    const icp = args.icp.trim();
    if (!icp) {
      throw new Error("Enter an ICP description before searching.");
    }

    const runId = args.runId;
    const apiKey = process.env.FIBER_API_KEY;

    if (!apiKey) {
      await ctx.runMutation(internal.leads.finishRun, {
        runId,
        status: "error",
        leadCount: 0,
        errorMessage:
          "FIBER_API_KEY is not set. Run: npx convex env set FIBER_API_KEY your_key",
      });
      return { runId };
    }

    try {
      const result = await searchAudience(icp, apiKey, { pageSize: 25 });

      if (result.leads.length === 0) {
        await ctx.runMutation(internal.leads.finishRun, {
          runId,
          status: "empty",
          resultType: result.resultType,
          fiberSearchId: result.searchId,
          leadCount: 0,
        });
        return { runId };
      }

      for (const lead of result.leads) {
        await ctx.runMutation(internal.leads.insertLead, {
          runId,
          icp,
          resultType: lead.resultType,
          personName: lead.personName,
          companyName: lead.companyName,
          role: lead.role,
          socialSignal: lead.socialSignal,
          linkedinUrl: lead.linkedinUrl,
          locality: lead.locality,
          fiberSearchId: lead.fiberSearchId ?? result.searchId,
        });
      }

      await ctx.runMutation(internal.leads.finishRun, {
        runId,
        status: "complete",
        resultType: result.resultType,
        fiberSearchId: result.searchId,
        leadCount: result.leads.length,
      });

      return { runId };
    } catch (error) {
      const message =
        error instanceof FiberApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown Fiber error";

      await ctx.runMutation(internal.leads.finishRun, {
        runId,
        status: "error",
        leadCount: 0,
        errorMessage: message,
      });

      return { runId };
    }
  },
});
