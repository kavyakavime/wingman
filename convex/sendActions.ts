"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { DEMO_RECIPIENTS } from "../lib/demoRecipients";
import { inferLeadSegment } from "../lib/inferSegment";
import { parseRewriteDraft } from "../lib/parseRewriteDraft";
import { OrangeSliceApiError, sendOutreach } from "../lib/orangeslice";
import type { PersonaSegment } from "../lib/segments";

type SendResult = {
  recipientEmail: string;
  recipientLabel: string;
  segment: PersonaSegment;
  subject: string;
  bodyPreview: string;
  success: boolean;
  errorMessage: string | null;
  messageId: string | null;
  sentAt: number;
};

export const sendWinningVariants = action({
  args: {
    /** Must be true — UI confirmation gate for real email send. */
    confirmed: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ results: SendResult[] }> => {
    if (!args.confirmed) {
      throw new Error(
        "Send not confirmed. Set confirmed: true after reviewing recipients in the UI.",
      );
    }

    const apiKey = process.env.ORANGESLICE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ORANGESLICE_API_KEY is not set in Convex env. Run: npx convex env set ORANGESLICE_API_KEY your_key",
      );
    }

    const rewrites = await ctx.runQuery(internal.segmentRewrites.listInternal, {});
    if (rewrites.length === 0) {
      throw new Error(
        "No segment rewrites found. Generate rewrites before sending.",
      );
    }

    const rewriteBySegment = new Map<PersonaSegment, string>();
    for (const row of rewrites) {
      rewriteBySegment.set(row.segment as PersonaSegment, row.rewrittenDraft);
    }

    const sentAt = Date.now();
    const results: SendResult[] = [];

    for (const recipient of DEMO_RECIPIENTS) {
      const draft = rewriteBySegment.get(recipient.segment);
      if (!draft?.trim()) {
        results.push({
          recipientEmail: recipient.email,
          recipientLabel: recipient.label,
          segment: recipient.segment,
          subject: "",
          bodyPreview: "",
          success: false,
          errorMessage: `No rewrite found for segment: ${recipient.segment}`,
          messageId: null,
          sentAt,
        });
        continue;
      }

      let subject: string;
      let body: string;
      try {
        ({ subject, body } = parseRewriteDraft(draft));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Parse error";
        results.push({
          recipientEmail: recipient.email,
          recipientLabel: recipient.label,
          segment: recipient.segment,
          subject: "",
          bodyPreview: draft.slice(0, 200),
          success: false,
          errorMessage: message,
          messageId: null,
          sentAt,
        });
        continue;
      }

      try {
        const sendResult = await sendOutreach(
          recipient.email,
          subject,
          body,
          apiKey,
        );
        results.push({
          recipientEmail: recipient.email,
          recipientLabel: recipient.label,
          segment: recipient.segment,
          subject,
          bodyPreview: body.slice(0, 280) + (body.length > 280 ? "…" : ""),
          success: true,
          errorMessage: null,
          messageId: sendResult.messageId ?? null,
          sentAt,
        });
      } catch (error) {
        const message =
          error instanceof OrangeSliceApiError
            ? `[${error.code}] ${error.message}`
            : error instanceof Error
              ? error.message
              : "Unknown send error";
        results.push({
          recipientEmail: recipient.email,
          recipientLabel: recipient.label,
          segment: recipient.segment,
          subject,
          bodyPreview: body.slice(0, 280) + (body.length > 280 ? "…" : ""),
          success: false,
          errorMessage: message,
          messageId: null,
          sentAt,
        });
      }
    }

    await ctx.runMutation(internal.sentLog.appendEntriesInternal, {
      entries: results.map((r) => ({
        recipientEmail: r.recipientEmail,
        recipientLabel: r.recipientLabel,
        segment: r.segment,
        subject: r.subject,
        bodyPreview: r.bodyPreview,
        success: r.success,
        errorMessage: r.errorMessage ?? undefined,
        messageId: r.messageId ?? undefined,
        sentAt: r.sentAt,
      })),
    });

    const failures = results.filter((r) => !r.success);
    if (failures.length === results.length) {
      throw new Error(
        `All ${failures.length} demo sends failed: ${failures.map((f) => `${f.recipientEmail} (${f.errorMessage})`).join("; ")}`,
      );
    }

    return { results };
  },
});

export const sendLeadOutreach = action({
  args: {
    leadId: v.id("leads"),
    toEmail: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId: string | null }> => {
    const toEmail = args.toEmail.trim();
    const subject = args.subject.trim();
    const body = args.body.trim();

    if (!toEmail.includes("@")) {
      throw new Error("Enter a valid recipient email address.");
    }
    if (!subject) {
      throw new Error("Subject cannot be empty.");
    }
    if (!body) {
      throw new Error("Email body cannot be empty.");
    }

    const apiKey = process.env.ORANGESLICE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ORANGESLICE_API_KEY is not set in Convex env. Run: npx convex env set ORANGESLICE_API_KEY your_key",
      );
    }

    const lead = await ctx.runQuery(internal.leads.getLeadInternal, {
      leadId: args.leadId,
    });
    if (!lead) {
      throw new Error("Lead not found.");
    }

    const segment = inferLeadSegment({
      _id: lead._id,
      personName: lead.personName,
      role: lead.role,
      segment: lead.segment as PersonaSegment | undefined,
    });
    const sentAt = Date.now();

    try {
      const sendResult = await sendOutreach(toEmail, subject, body, apiKey);
      await ctx.runMutation(internal.sentLog.appendEntriesInternal, {
        entries: [
          {
            recipientEmail: toEmail,
            recipientLabel: lead.personName ?? toEmail,
            segment,
            subject,
            bodyPreview: body.slice(0, 280) + (body.length > 280 ? "…" : ""),
            success: true,
            messageId: sendResult.messageId ?? undefined,
            sentAt,
          },
        ],
      });
      return { success: true, messageId: sendResult.messageId ?? null };
    } catch (error) {
      const message =
        error instanceof OrangeSliceApiError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown send error";

      await ctx.runMutation(internal.sentLog.appendEntriesInternal, {
        entries: [
          {
            recipientEmail: toEmail,
            recipientLabel: lead.personName ?? toEmail,
            segment,
            subject,
            bodyPreview: body.slice(0, 280) + (body.length > 280 ? "…" : ""),
            success: false,
            errorMessage: message,
            sentAt,
          },
        ],
      });
      throw new Error(message);
    }
  },
});
