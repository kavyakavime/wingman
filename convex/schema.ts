import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pings: defineTable({
    message: v.string(),
    createdAt: v.number(),
  }),
});
