import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { agentSentiment, personaSegment } from "./schema";

export const listSwarmReactions = query({
  args: {},
  handler: async (ctx) => {
    const reactions = await ctx.db.query("agent_reactions").collect();
    reactions.sort((a, b) => a.createdAt - b.createdAt);

    const enriched = await Promise.all(
      reactions.map(async (reaction) => {
        const lead = await ctx.db.get(reaction.leadId);
        return {
          ...reaction,
          round: reaction.round ?? 1,
          personName: lead?.personName ?? "Unknown",
        };
      }),
    );

    return enriched;
  },
});

export const listForLeadIdsInternal = internalQuery({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args) => {
    const idSet = new Set(args.leadIds);
    const reactions = await ctx.db.query("agent_reactions").collect();
    const filtered = reactions.filter((row) => idSet.has(row.leadId));

    return Promise.all(
      filtered.map(async (reaction) => {
        const lead = await ctx.db.get(reaction.leadId);
        return {
          ...reaction,
          round: reaction.round ?? 1,
          personName: lead?.personName ?? "Unknown",
        };
      }),
    );
  },
});

export const clearAllInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("agent_reactions").collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    return { deletedCount: existing.length };
  },
});

export const insertInternal = internalMutation({
  args: {
    leadId: v.id("leads"),
    segment: v.optional(personaSegment),
    sentiment: agentSentiment,
    reasoningText: v.string(),
    citedSignal: v.string(),
    round: v.optional(v.union(v.literal(1), v.literal(2))),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("agent_reactions", {
      leadId: args.leadId,
      segment: args.segment,
      sentiment: args.sentiment,
      reasoningText: args.reasoningText,
      citedSignal: args.citedSignal,
      round: args.round ?? 1,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const clearForLeadIdsInternal = internalMutation({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args) => {
    const idSet = new Set(args.leadIds);
    const existing = await ctx.db.query("agent_reactions").collect();
    let deletedCount = 0;
    for (const row of existing) {
      if (idSet.has(row.leadId)) {
        await ctx.db.delete(row._id);
        deletedCount += 1;
      }
    }
    return { deletedCount };
  },
});
