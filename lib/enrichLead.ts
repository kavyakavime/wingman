/**
 * Dual enrichment: Fiber live LinkedIn activity + Orange Slice persona signals.
 */

import { FiberApiError, getLatestActivity } from "./fiber";
import { OrangeSliceApiError, enrichPersona, type PersonaEnrichment } from "./orangeslice";
import type { FiberActivitySource } from "./fiber";

export type LeadEnrichmentInput = {
  personName?: string;
  companyName?: string;
  role?: string;
  socialSignal?: string;
  linkedinUrl: string;
  locality?: string;
};

export type CombinedLeadEnrichment = PersonaEnrichment & {
  fiberSignal?: string | null;
  fiberSignalKind?: string | null;
  fiberSignalSource?: FiberActivitySource | null;
};

export async function enrichLeadWithFiberAndOrangeSlice(
  lead: LeadEnrichmentInput,
  orangeKey: string,
  fiberKey?: string,
): Promise<CombinedLeadEnrichment> {
  const linkedinUrl = lead.linkedinUrl.trim();
  if (!linkedinUrl) {
    throw new OrangeSliceApiError("LinkedIn URL is required for enrichment.", "api_error");
  }

  let fiberActivity: Awaited<ReturnType<typeof getLatestActivity>> | null = null;
  if (fiberKey?.trim()) {
    try {
      fiberActivity = await getLatestActivity(linkedinUrl, fiberKey.trim());
    } catch (error) {
      if (error instanceof FiberApiError) throw error;
      throw new FiberApiError(
        error instanceof Error ? error.message : "Fiber activity fetch failed.",
        "api_error",
      );
    }
  }

  const orangeEnrichment = await enrichPersona(
    {
      personName: lead.personName,
      companyName: lead.companyName,
      role: lead.role,
      socialSignal: lead.socialSignal,
      linkedinUrl,
      locality: lead.locality,
      recentActivity: fiberActivity?.recentActivity ?? undefined,
    },
    orangeKey,
  );

  const fiberSignal = fiberActivity?.recentActivity ?? null;
  const recentActivity = orangeEnrichment.recentActivity?.trim() || null;

  return {
    ...orangeEnrichment,
    recentActivity,
    fiberSignal,
    fiberSignalKind: fiberActivity?.signalKind ?? null,
    fiberSignalSource: fiberActivity?.activitySource ?? "none",
  };
}
