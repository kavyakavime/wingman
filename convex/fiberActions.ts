"use node";

import { filterViableAudienceLeads } from "../lib/audienceLead";
import {
  attachCompanyBrandingToLeads,
  resolveAudiencePageSize,
  searchAudienceViaOrangeSlice,
} from "../lib/orangeSliceLeads";
import { OrangeSliceApiError } from "../lib/orangeslice";
import { logOrangeSlice, summarizeLead } from "../lib/orangeSliceLog";
import {
  IcpAttachmentError,
  resolveFiberIcpQuery,
  type IcpAttachmentPayload,
} from "../lib/icpAttachment";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
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

    const apiKey = process.env.ORANGESLICE_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.leads.finishRun, {
        runId,
        status: "error",
        leadCount: 0,
        errorMessage:
          "ORANGESLICE_API_KEY is not set. Run: npx convex env set ORANGESLICE_API_KEY your_key",
      });
      return { runId };
    }

    const fiberKey = process.env.FIBER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    try {
      const pageSize = resolveAudiencePageSize(args.icp, icp);
      logOrangeSlice("fetchAudience start", { runId, icp, pageSize, fiber: Boolean(fiberKey) });

      const leadIds: Id<"leads">[] = [];

      const result = await searchAudienceViaOrangeSlice(icp, apiKey, {
        pageSize,
        fiberKey,
        openaiKey,
        onLead: async (lead) => {
          const viable = filterViableAudienceLeads([lead]);
          if (viable.length === 0) return;

          const leadId = await ctx.runMutation(internal.leads.insertLead, {
            runId,
            icp,
            resultType: "people",
            personName: lead.personName,
            companyName: lead.companyName,
            role: lead.role,
            socialSignal: lead.socialSignal,
            linkedinUrl: lead.linkedinUrl,
            locality: lead.locality,
            fiberSearchId: lead.fiberSearchId ?? "orange-slice",
          });
          leadIds.push(leadId);
          logOrangeSlice("fetchAudience lead", { runId, lead: summarizeLead(lead) });
        },
      });

      const pipeline = filterViableAudienceLeads(result.leads);

      if (pipeline.length === 0 && leadIds.length === 0) {
        await ctx.runMutation(internal.leads.finishRun, {
          runId,
          status: "empty",
          resultType: "people",
          fiberSearchId: result.searchId,
          leadCount: 0,
        });
        return { runId };
      }

      await ctx.runMutation(internal.leads.finishRun, {
        runId,
        status: "complete",
        resultType: "people",
        fiberSearchId: result.searchId,
        orangeSliceSpreadsheetId: result.orangeSliceSpreadsheetId,
        leadCount: Math.max(pipeline.length, leadIds.length),
      });

      try {
        const branded = await attachCompanyBrandingToLeads(pipeline, apiKey);
        for (let i = 0; i < branded.length; i += 1) {
          const leadId = leadIds[i];
          if (!leadId) continue;
          await ctx.runMutation(internal.leads.patchLeadBranding, {
            leadId,
            companyName: branded[i].companyName,
            companyLogoUrl: branded[i].companyLogoUrl,
            companyLinkedinUrl: branded[i].companyLinkedinUrl,
          });
        }
      } catch (error) {
        logOrangeSlice("fetchAudience branding skipped", {
          runId,
          error: error instanceof Error ? error.message : "branding failed",
        });
      }

      return { runId };
    } catch (error) {
      const message =
        error instanceof OrangeSliceApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown search error";

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
