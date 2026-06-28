import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { LOCKED_DEMO_PERSONAS, normalizePersonName } from "../lib/lockedPersonas";

export const getRun = query({
  args: { runId: v.id("audienceRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const listByRun = query({
  args: { runId: v.id("audienceRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .withIndex("by_runId_createdAt", (q) => q.eq("runId", args.runId))
      .collect();
  },
});

export const latestRun = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("audienceRuns")
      .withIndex("by_createdAt")
      .order("desc")
      .first();
  },
});

export const getLeadInternal = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});

export const listLockedPersonas = query({
  args: {},
  handler: async (ctx) => {
    const locked = await ctx.db
      .query("leads")
      .withIndex("by_isLockedDemo", (q) => q.eq("isLockedDemo", true))
      .collect();

    return locked.sort((a, b) => {
      const order = LOCKED_DEMO_PERSONAS.map((p) => normalizePersonName(p.personName));
      const aIdx = order.indexOf(normalizePersonName(a.personName ?? ""));
      const bIdx = order.indexOf(normalizePersonName(b.personName ?? ""));
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  },
});

export const startSearch = mutation({
  args: { icp: v.string() },
  handler: async (ctx, args) => {
    const icp = args.icp.trim();
    if (!icp) throw new Error("Enter an ICP description before searching.");
    return await ctx.db.insert("audienceRuns", {
      icp,
      status: "loading",
      leadCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const ensureLockedDemoLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    let demoRun = (
      await ctx.db.query("audienceRuns").order("desc").collect()
    ).find((run) => run.icp === "LOCKED_DEMO_PERSONAS");

    if (!demoRun) {
      const runId = await ctx.db.insert("audienceRuns", {
        icp: "LOCKED_DEMO_PERSONAS",
        status: "complete",
        resultType: "people",
        leadCount: LOCKED_DEMO_PERSONAS.length,
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
      const created = await ctx.db.get(runId);
      if (!created) throw new Error("Failed to create demo audience run.");
      demoRun = created;
    }

    const allLeads = await ctx.db.query("leads").collect();
    const leadIds: Array<(typeof allLeads)[number]["_id"]> = [];

    for (const persona of LOCKED_DEMO_PERSONAS) {
      const normalized = normalizePersonName(persona.personName);
      const existing =
        allLeads.find(
          (lead) => normalizePersonName(lead.personName ?? "") === normalized,
        ) ??
        (await ctx.db
          .query("leads")
          .filter((q) => q.eq(q.field("isLockedDemo"), true))
          .collect())
          .find((lead) => normalizePersonName(lead.personName ?? "") === normalized);

      if (existing) {
        await ctx.db.patch(existing._id, {
          isLockedDemo: true,
          enrichmentStatus: existing.enrichmentStatus ?? "pending",
        });
        leadIds.push(existing._id);
        continue;
      }

      throw new Error(
        `Locked persona "${persona.personName}" not found in leads. Run Fiber search first.`,
      );
    }

    return leadIds;
  },
});

export const setLeadEnrichmentLoading = internalMutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, { enrichmentStatus: "loading" });
  },
});

export const applyLeadEnrichment = internalMutation({
  args: {
    leadId: v.id("leads"),
    recentActivity: v.optional(v.string()),
    activitySource: v.union(
      v.literal("latest_activities"),
      v.literal("posts"),
      v.literal("none"),
    ),
    fundingStage: v.optional(v.string()),
    painSignal: v.optional(v.string()),
    intentScore: v.optional(v.number()),
    enrichmentError: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { leadId, enrichmentError, ...fields } = args;
    await ctx.db.patch(leadId, {
      ...fields,
      enrichmentStatus: enrichmentError ? "error" : "complete",
      enrichmentError,
      enrichedAt: Date.now(),
    });
  },
});

export const insertLead = internalMutation({
  args: {
    runId: v.id("audienceRuns"),
    icp: v.string(),
    resultType: v.union(v.literal("people"), v.literal("companies")),
    personName: v.optional(v.string()),
    companyName: v.optional(v.string()),
    role: v.optional(v.string()),
    socialSignal: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    locality: v.optional(v.string()),
    fiberSearchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...lead } = args;
    await ctx.db.insert("leads", {
      runId,
      ...lead,
      createdAt: Date.now(),
    });

    const run = await ctx.db.get(runId);
    if (run) {
      await ctx.db.patch(runId, { leadCount: run.leadCount + 1 });
    }
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("audienceRuns"),
    status: v.union(v.literal("complete"), v.literal("empty"), v.literal("error")),
    resultType: v.optional(v.union(v.literal("people"), v.literal("companies"))),
    fiberSearchId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    leadCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      resultType: args.resultType,
      fiberSearchId: args.fiberSearchId,
      errorMessage: args.errorMessage,
      leadCount: args.leadCount,
      completedAt: Date.now(),
    });
  },
});
