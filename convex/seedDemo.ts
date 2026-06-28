"use node";

import {
  FiberApiError,
  getLatestActivity,
  lookupPersonByNameAndCompany,
} from "../lib/fiber";
import { LOCKED_DEMO_PERSONAS } from "../lib/lockedPersonas";
import { LOCKED_SEGMENT_ASSIGNMENTS } from "../lib/segments";
import { OrangeSliceApiError, enrichPersona } from "../lib/orangeslice";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type PersonaSeedResult = {
  personName: string;
  companyName: string;
  leadId: Id<"leads"> | null;
  created: boolean;
  enriched: boolean;
  segment: string | null;
  error: string | null;
};

/**
 * One-shot deterministic seed for the 6 locked demo personas.
 * Fiber kitchen-sink lookup → upsert leads → enrich → assign segments.
 * Idempotent: safe to run twice (match-or-create by normalized personName).
 */
export const seedLockedDemoPersonas = action({
  args: {},
  handler: async (ctx): Promise<{
    seededCount: number;
    enrichedCount: number;
    personas: PersonaSeedResult[];
  }> => {
    const fiberKey = process.env.FIBER_API_KEY;
    const orangeKey = process.env.ORANGESLICE_API_KEY;

    if (!fiberKey) {
      throw new Error(
        "FIBER_API_KEY is not set in Convex env. Run: npx convex env set FIBER_API_KEY your_key",
      );
    }

    const runId = await ctx.runMutation(internal.leads.getLockedDemoRunInternal, {});

    const personas: PersonaSeedResult[] = [];
    let seededCount = 0;
    let enrichedCount = 0;

    for (const persona of LOCKED_DEMO_PERSONAS) {
      const segment = LOCKED_SEGMENT_ASSIGNMENTS[persona.personName] ?? null;
      const base: PersonaSeedResult = {
        personName: persona.personName,
        companyName: persona.companyName,
        leadId: null,
        created: false,
        enriched: false,
        segment,
        error: null,
      };

      try {
        const profile = await lookupPersonByNameAndCompany(
          {
            personName: persona.personName,
            companyName: persona.companyName,
          },
          fiberKey,
        );

        if (!segment) {
          throw new Error(`No segment mapping for ${persona.personName}.`);
        }

        const { leadId, created } = await ctx.runMutation(
          internal.leads.upsertLockedDemoLeadInternal,
          {
            runId,
            personName: persona.personName,
            companyName: profile.companyName ?? persona.companyName,
            role: profile.role,
            socialSignal: profile.socialSignal,
            linkedinUrl: profile.linkedinUrl,
            locality: profile.locality,
            segment,
          },
        );

        base.leadId = leadId;
        base.created = created;
        seededCount += 1;

        if (!orangeKey) {
          await ctx.runMutation(internal.leads.applyLeadEnrichment, {
            leadId,
            activitySource: "none",
            enrichmentError: "ORANGESLICE_API_KEY is not set in Convex env.",
          });
          base.error = "ORANGESLICE_API_KEY is not set in Convex env.";
          personas.push(base);
          continue;
        }

        const linkedinUrl = profile.linkedinUrl;
        if (!linkedinUrl) {
          await ctx.runMutation(internal.leads.applyLeadEnrichment, {
            leadId,
            activitySource: "none",
            enrichmentError: "Fiber lookup returned no LinkedIn URL.",
          });
          base.error = "Fiber lookup returned no LinkedIn URL.";
          personas.push(base);
          continue;
        }

        await ctx.runMutation(internal.leads.setLeadEnrichmentLoading, { leadId });

        try {
          const activity = await getLatestActivity(linkedinUrl, fiberKey);
          const enrichment = await enrichPersona(
            {
              personName: persona.personName,
              companyName: profile.companyName ?? persona.companyName,
              role: profile.role,
              socialSignal: profile.socialSignal,
              linkedinUrl,
              locality: profile.locality,
              recentActivity: activity.recentActivity,
            },
            orangeKey,
          );

          await ctx.runMutation(internal.leads.applyLeadEnrichment, {
            leadId,
            recentActivity: activity.recentActivity ?? undefined,
            activitySource: activity.activitySource,
            fundingStage: enrichment.fundingStage ?? undefined,
            painSignal: enrichment.painSignal ?? undefined,
            intentScore: enrichment.intentScore ?? undefined,
          });

          base.enriched = true;
          enrichedCount += 1;
        } catch (error) {
          const message =
            error instanceof FiberApiError || error instanceof OrangeSliceApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Unknown enrichment error";

          await ctx.runMutation(internal.leads.applyLeadEnrichment, {
            leadId,
            activitySource: "none",
            enrichmentError: message,
          });
          base.error = message;
        }
      } catch (error) {
        base.error =
          error instanceof FiberApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown seed error";
      }

      personas.push(base);
    }

    const failures = personas.filter((p) => p.error && !p.leadId);
    if (failures.length > 0) {
      throw new Error(
        `seedLockedDemoPersonas failed for: ${failures.map((p) => `${p.personName} (${p.error})`).join("; ")}`,
      );
    }

    return { seededCount, enrichedCount, personas };
  },
});
