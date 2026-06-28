import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pings: defineTable({
    message: v.string(),
    createdAt: v.number(),
  }),

  audienceRuns: defineTable({
    icp: v.string(),
    status: v.union(
      v.literal("loading"),
      v.literal("complete"),
      v.literal("empty"),
      v.literal("error"),
    ),
    resultType: v.optional(v.union(v.literal("people"), v.literal("companies"))),
    fiberSearchId: v.optional(v.string()),
    leadCount: v.number(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_createdAt", ["createdAt"]),

  leads: defineTable({
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
    isLockedDemo: v.optional(v.boolean()),
    enrichmentStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("loading"),
        v.literal("complete"),
        v.literal("error"),
      ),
    ),
    recentActivity: v.optional(v.string()),
    activitySource: v.optional(
      v.union(
        v.literal("latest_activities"),
        v.literal("posts"),
        v.literal("none"),
      ),
    ),
    fundingStage: v.optional(v.string()),
    painSignal: v.optional(v.string()),
    intentScore: v.optional(v.number()),
    enrichmentError: v.optional(v.string()),
    createdAt: v.number(),
    enrichedAt: v.optional(v.number()),
  })
    .index("by_runId", ["runId"])
    .index("by_runId_createdAt", ["runId", "createdAt"])
    .index("by_isLockedDemo", ["isLockedDemo"]),
});
