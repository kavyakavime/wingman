import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Health-check query — returns a live timestamp from Convex. */
export const get = query({
  args: {},
  handler: async () => {
    return {
      status: "ok" as const,
      timestamp: Date.now(),
    };
  },
});

/** Health-check mutation — writes a ping row and returns its timestamp. */
export const record = mutation({
  args: { message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const createdAt = Date.now();
    await ctx.db.insert("pings", {
      message: args.message ?? "ping",
      createdAt,
    });
    return { status: "ok" as const, timestamp: createdAt };
  },
});

/** Latest recorded ping for end-to-end verification. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const ping = await ctx.db
      .query("pings")
      .order("desc")
      .first();
    return ping ?? null;
  },
});
