import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const personaSegment = v.union(
  v.literal("scaled"),
  v.literal("early_stage"),
  v.literal("vertical_specialist"),
);

export const agentSentiment = v.union(
  v.literal("positive"),
  v.literal("neutral"),
  v.literal("objecting"),
);

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
    segment: v.optional(personaSegment),
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
    .index("by_isLockedDemo", ["isLockedDemo"])
    .index("by_segment", ["segment"]),

  /** Hour 5 swarm writes here; schema locked in hour 4. */
  agent_reactions: defineTable({
    leadId: v.id("leads"),
    segment: v.optional(personaSegment),
    sentiment: agentSentiment,
    reasoningText: v.string(),
    citedSignal: v.string(),
    /** 1 = solo; 2 = peer influence; 3 = rewritten-variant re-test (hour 8). */
    round: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    createdAt: v.number(),
  })
    .index("by_leadId", ["leadId"])
    .index("by_segment", ["segment"])
    .index("by_leadId_createdAt", ["leadId", "createdAt"])
    .index("by_leadId_round", ["leadId", "round"]),

  /** Hour 8 — segment-specific rewritten drafts from Cursor SDK / OpenAI fallback. */
  segment_rewrites: defineTable({
    segment: personaSegment,
    rewrittenDraft: v.string(),
    basedOnSignals: v.array(v.string()),
    generatedVia: v.union(v.literal("cursor_sdk"), v.literal("openai_fallback")),
    createdAt: v.number(),
  }).index("by_segment", ["segment"]),

  /** Hour 9 — opt-in demo send log (Orange Slice real send). */
  sent_log: defineTable({
    recipientEmail: v.string(),
    recipientLabel: v.optional(v.string()),
    segment: personaSegment,
    subject: v.string(),
    bodyPreview: v.string(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    messageId: v.optional(v.string()),
    sentAt: v.number(),
  }).index("by_sentAt", ["sentAt"]),
});
