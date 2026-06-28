import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { personaSegment } from "./schema";

export const listSentLog = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sent_log").withIndex("by_sentAt").order("desc").collect();
    return rows;
  },
});

export const appendEntriesInternal = internalMutation({
  args: {
    entries: v.array(
      v.object({
        recipientEmail: v.string(),
        recipientLabel: v.optional(v.string()),
        segment: personaSegment,
        subject: v.string(),
        bodyPreview: v.string(),
        success: v.boolean(),
        errorMessage: v.optional(v.string()),
        messageId: v.optional(v.string()),
        sentAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const entry of args.entries) {
      const id = await ctx.db.insert("sent_log", entry);
      ids.push(id);
    }
    return { insertedCount: ids.length };
  },
});
