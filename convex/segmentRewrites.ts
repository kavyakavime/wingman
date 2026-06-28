import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { personaSegment } from "./schema";

export const listSegmentRewrites = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("segment_rewrites").collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows;
  },
});

export const listInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("segment_rewrites").collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows;
  },
});

export const replaceSegmentInternal = internalMutation({
  args: {
    segment: personaSegment,
    rewrittenDraft: v.string(),
    basedOnSignals: v.array(v.string()),
    generatedVia: v.union(v.literal("cursor_sdk"), v.literal("openai_fallback")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("segment_rewrites")
      .withIndex("by_segment", (q) => q.eq("segment", args.segment))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const id = await ctx.db.insert("segment_rewrites", {
      segment: args.segment,
      rewrittenDraft: args.rewrittenDraft,
      basedOnSignals: args.basedOnSignals,
      generatedVia: args.generatedVia,
      createdAt: Date.now(),
    });

    return { id, replacedCount: existing.length };
  },
});

export const replaceAllInternal = internalMutation({
  args: {
    rewrites: v.array(
      v.object({
        segment: personaSegment,
        rewrittenDraft: v.string(),
        basedOnSignals: v.array(v.string()),
        generatedVia: v.union(v.literal("cursor_sdk"), v.literal("openai_fallback")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("segment_rewrites").collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    const ids = [];
    for (const rewrite of args.rewrites) {
      const id = await ctx.db.insert("segment_rewrites", {
        ...rewrite,
        createdAt: now,
      });
      ids.push(id);
    }

    return { insertedCount: ids.length };
  },
});
