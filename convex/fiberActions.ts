"use node";

import { FiberApiError, resolveFiberPageSize, searchAudience } from "../lib/fiber";
import {
  IcpAttachmentError,
  resolveFiberIcpQuery,
  type IcpAttachmentPayload,
} from "../lib/icpAttachment";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const icpAttachmentValidator = v.object({
  fileName: v.string(),
  mimeType: v.string(),
  base64: v.optional(v.string()),
  textContent: v.optional(v.string()),
});

export const fetchAudience = action({
  args: {
    runId: v.id("audienceRuns"),
    icp: v.string(),
    attachment: v.optional(icpAttachmentValidator),
  },
  handler: async (ctx, args): Promise<{ runId: Id<"audienceRuns"> }> => {
    const runId = args.runId;
    let icp = args.icp.trim();
    const attachment = args.attachment as IcpAttachmentPayload | undefined;

    if (attachment) {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        await ctx.runMutation(internal.leads.finishRun, {
          runId,
          status: "error",
          leadCount: 0,
          errorMessage:
            "OPENAI_API_KEY is not set. Run: npx convex env set OPENAI_API_KEY your_key",
        });
        return { runId };
      }

      try {
        icp = await resolveFiberIcpQuery(openaiApiKey, icp, attachment);
        await ctx.runMutation(internal.leads.updateRunIcp, { runId, icp });
      } catch (error) {
        const message =
          error instanceof IcpAttachmentError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not read attachment.";

        await ctx.runMutation(internal.leads.finishRun, {
          runId,
          status: "error",
          leadCount: 0,
          errorMessage: message,
        });
        return { runId };
      }
    }

    if (!icp) {
      throw new Error("Enter an ICP description before searching.");
    }

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
      const pageSize = resolveFiberPageSize(args.icp, icp);
      const result = await searchAudience(icp, apiKey, { pageSize });

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
