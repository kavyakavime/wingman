import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { LOCKED_DEMO_PERSONAS, normalizePersonName } from "../lib/lockedPersonas";
import { LOCKED_SEGMENT_ASSIGNMENTS } from "../lib/segments";
import type { Doc } from "./_generated/dataModel";
import { personaSegment } from "./schema";

/** Same personName matching as ensureLockedDemoLeads / enrichLockedPersonas. */
function findLeadByPersonName(
  allLeads: Doc<"leads">[],
  personName: string,
): Doc<"leads"> | undefined {
  const normalized = normalizePersonName(personName);
  return allLeads.find(
    (lead) => normalizePersonName(lead.personName ?? "") === normalized,
  );
}

/** TEMPORARY — inspect raw personName values vs LOCKED_DEMO_PERSONAS. Remove after debug. */
export const debugLeadNames = query({
  args: {},
  handler: async (ctx) => {
    const allLeads = await ctx.db.query("leads").collect();

    const quotedLeadNames = allLeads.map((lead) => ({
      leadId: lead._id,
      personNameQuoted: JSON.stringify(lead.personName ?? null),
      normalizedQuoted: JSON.stringify(normalizePersonName(lead.personName ?? "")),
      isLockedDemo: lead.isLockedDemo === true,
    }));

    const lockedDemoPersonasLiteral = LOCKED_DEMO_PERSONAS.map((p) => ({
      personNameQuoted: JSON.stringify(p.personName),
      companyNameQuoted: JSON.stringify(p.companyName),
      normalizedQuoted: JSON.stringify(normalizePersonName(p.personName)),
      charCodes: [...p.personName].map((ch) => ch.charCodeAt(0)),
    }));

    return {
      deploymentNote: "Compare quotedLeadNames vs lockedDemoPersonasLiteral side by side",
      leadCount: allLeads.length,
      quotedLeadNames,
      lockedDemoPersonasLiteral,
    };
  },
});

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

export const getLeadsByIdsInternal = internalQuery({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args) => {
    const leads = await Promise.all(args.leadIds.map((id) => ctx.db.get(id)));
    return leads.filter((lead): lead is Doc<"leads"> => lead != null);
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

/** Non-locked leads for ambient graph density (visual only, no swarm). */
export const listAmbientGraphLeads = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("leads").collect();
    return all
      .filter((lead) => lead.isLockedDemo !== true)
      .map((lead) => ({
        _id: lead._id,
        personName: lead.personName,
      }));
  },
});

export const listLockedPersonasInternal = internalQuery({
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

/** One-time: mark the 6 locked demo leads by personName (run before assignLockedSegments). */
export const markLockedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const allLeads = await ctx.db.query("leads").collect();

    const matched: Array<{
      personName: string;
      leadId: string;
      alreadyLocked: boolean;
    }> = [];
    const notMatched: string[] = [];

    for (const persona of LOCKED_DEMO_PERSONAS) {
      const lead = findLeadByPersonName(allLeads, persona.personName);

      if (!lead) {
        notMatched.push(persona.personName);
        continue;
      }

      const alreadyLocked = lead.isLockedDemo === true;
      if (!alreadyLocked) {
        await ctx.db.patch(lead._id, { isLockedDemo: true });
      }

      matched.push({
        personName: persona.personName,
        leadId: lead._id,
        alreadyLocked,
      });
    }

    if (notMatched.length > 0) {
      throw new Error(
        `markLockedDemo: no lead matched for: ${notMatched.join(", ")}. ` +
          `Matched (${matched.length}): ${matched.map((m) => m.personName).join(", ") || "none"}`,
      );
    }

    return {
      matchedCount: matched.length,
      matched,
      notMatched,
      allMatched: notMatched.length === 0,
    };
  },
});

/** One-time: assign locked segment tags to the 6 demo personas. */
export const assignLockedSegments = mutation({
  args: {},
  handler: async (ctx) => {
    const locked = await ctx.db
      .query("leads")
      .withIndex("by_isLockedDemo", (q) => q.eq("isLockedDemo", true))
      .collect();

    const updated: Array<{ personName: string; segment: string; leadId: string }> = [];
    const missing: string[] = [];

    for (const [personName, segment] of Object.entries(LOCKED_SEGMENT_ASSIGNMENTS)) {
      const normalized = normalizePersonName(personName);
      const lead = locked.find(
        (row) => normalizePersonName(row.personName ?? "") === normalized,
      );

      if (!lead) {
        missing.push(personName);
        continue;
      }

      await ctx.db.patch(lead._id, { segment });
      updated.push({ personName, segment, leadId: lead._id });
    }

    if (missing.length > 0) {
      throw new Error(
        `Locked leads not found for: ${missing.join(", ")}. Mark them isLockedDemo first.`,
      );
    }

    return { updatedCount: updated.length, updated };
  },
});

/** Verify all 6 locked personas have segments assigned. */
export const verifyLockedSegments = query({
  args: {},
  handler: async (ctx) => {
    const locked = await ctx.db
      .query("leads")
      .withIndex("by_isLockedDemo", (q) => q.eq("isLockedDemo", true))
      .collect();

    const expected = Object.entries(LOCKED_SEGMENT_ASSIGNMENTS).map(
      ([personName, segment]) => {
        const lead = locked.find(
          (row) =>
            normalizePersonName(row.personName ?? "") ===
            normalizePersonName(personName),
        );
        return {
          personName,
          expectedSegment: segment,
          actualSegment: lead?.segment ?? null,
          hasSegment: lead?.segment != null,
          matches: lead?.segment === segment,
        };
      },
    );

    return {
      allAssigned: expected.every((row) => row.hasSegment && row.matches),
      personas: expected,
    };
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

export const getLockedDemoRunInternal = internalMutation({
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
        leadCount: 0,
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
      const created = await ctx.db.get(runId);
      if (!created) throw new Error("Failed to create locked demo audience run.");
      demoRun = created;
    }

    return demoRun._id;
  },
});

export const upsertLockedDemoLeadInternal = internalMutation({
  args: {
    runId: v.id("audienceRuns"),
    personName: v.string(),
    companyName: v.optional(v.string()),
    role: v.optional(v.string()),
    socialSignal: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    locality: v.optional(v.string()),
    segment: personaSegment,
  },
  handler: async (ctx, args) => {
    const allLeads = await ctx.db.query("leads").collect();
    const existing = findLeadByPersonName(allLeads, args.personName);

    const fields = {
      isLockedDemo: true as const,
      segment: args.segment,
      personName: args.personName,
      companyName: args.companyName,
      role: args.role,
      socialSignal: args.socialSignal,
      linkedinUrl: args.linkedinUrl,
      locality: args.locality,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { leadId: existing._id, created: false };
    }

    const leadId = await ctx.db.insert("leads", {
      runId: args.runId,
      icp: "LOCKED_DEMO_PERSONAS",
      resultType: "people",
      ...fields,
      enrichmentStatus: "pending",
      createdAt: Date.now(),
    });

    const run = await ctx.db.get(args.runId);
    if (run) {
      await ctx.db.patch(args.runId, {
        leadCount: run.leadCount + 1,
        status: "complete",
        resultType: "people",
        completedAt: Date.now(),
      });
    }

    return { leadId, created: true };
  },
});

export const ensureLockedDemoLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allLeads = await ctx.db.query("leads").collect();
    const leadIds: Array<(typeof allLeads)[number]["_id"]> = [];

    for (const persona of LOCKED_DEMO_PERSONAS) {
      const existing = findLeadByPersonName(allLeads, persona.personName);

      if (existing) {
        await ctx.db.patch(existing._id, {
          isLockedDemo: true,
          enrichmentStatus: existing.enrichmentStatus ?? "pending",
        });
        leadIds.push(existing._id);
        continue;
      }

      throw new Error(
        `Locked persona "${persona.personName}" not found in leads. Run seedDemo:seedLockedDemoPersonas first.`,
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
    fiberSignal: v.optional(v.string()),
    fiberSignalKind: v.optional(v.string()),
    fiberSignalSource: v.optional(
      v.union(
        v.literal("latest_activities"),
        v.literal("posts"),
        v.literal("none"),
      ),
    ),
    intentScore: v.optional(v.number()),
    enrichmentError: v.optional(v.string()),
    personName: v.optional(v.string()),
    role: v.optional(v.string()),
    companyName: v.optional(v.string()),
    locality: v.optional(v.string()),
    companyLogoUrl: v.optional(v.string()),
    companyLinkedinUrl: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
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

/** Mark any still-loading leads in a batch as error (timeout / interrupted action). */
export const finalizeEnrichmentBatch = internalMutation({
  args: {
    leadIds: v.array(v.id("leads")),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    for (const leadId of args.leadIds) {
      const lead = await ctx.db.get(leadId);
      if (!lead || lead.enrichmentStatus !== "loading") continue;
      await ctx.db.patch(leadId, {
        enrichmentStatus: "error",
        enrichmentError: args.errorMessage,
        enrichedAt: Date.now(),
      });
    }
  },
});

export const clearStuckEnrichment = mutation({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, args) => {
    const errorMessage =
      "Enrichment was interrupted. Re-run enrich to retry this lead.";
    for (const leadId of args.leadIds) {
      const lead = await ctx.db.get(leadId);
      if (!lead || lead.enrichmentStatus !== "loading") continue;
      await ctx.db.patch(leadId, {
        enrichmentStatus: "error",
        enrichmentError: errorMessage,
        enrichedAt: Date.now(),
      });
    }
  },
});

export const patchLeadBranding = internalMutation({
  args: {
    leadId: v.id("leads"),
    companyName: v.optional(v.string()),
    companyLogoUrl: v.optional(v.string()),
    companyLinkedinUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { leadId, ...fields } = args;
    await ctx.db.patch(leadId, fields);
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
    companyLogoUrl: v.optional(v.string()),
    companyLinkedinUrl: v.optional(v.string()),
    fiberSearchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...lead } = args;
    const leadId = await ctx.db.insert("leads", {
      runId,
      ...lead,
      createdAt: Date.now(),
    });

    const run = await ctx.db.get(runId);
    if (run) {
      await ctx.db.patch(runId, { leadCount: run.leadCount + 1 });
    }

    return leadId;
  },
});

export const updateRunIcp = internalMutation({
  args: {
    runId: v.id("audienceRuns"),
    icp: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { icp: args.icp.trim() });
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("audienceRuns"),
    status: v.union(v.literal("complete"), v.literal("empty"), v.literal("error")),
    resultType: v.optional(v.union(v.literal("people"), v.literal("companies"))),
    fiberSearchId: v.optional(v.string()),
    orangeSliceSpreadsheetId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    leadCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      resultType: args.resultType,
      fiberSearchId: args.fiberSearchId,
      orangeSliceSpreadsheetId: args.orangeSliceSpreadsheetId,
      errorMessage: args.errorMessage,
      leadCount: args.leadCount,
      completedAt: Date.now(),
    });
  },
});
