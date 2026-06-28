/**
 * Hybrid audience search — Orange Slice workflow pull + Fiber NLP, filtered for ICP fit.
 */

import type { AudienceLead } from "./audienceLead";
import {
  dedupeAudienceLeads,
  filterAudienceLeadsByIcpRelevance,
  filterAudienceLeadsForIcp,
} from "./audienceIcpFilter";
import { searchAudience as searchFiberAudience } from "./fiber";
import { enrichCompanyBranding } from "./orangeslice";
import { OrangeSliceApiError } from "./orangeslice";
import { logoUrlForCompany } from "./companyLogo";
import { isJunkCompanyName } from "./linkedinHeadline";
import { fetchAudienceFromOrangeSlice } from "./orangeSliceAudience";
import { getTargetCompaniesForIcp } from "./orangeSliceWorkflow";
import { logOrangeSlice, summarizeLead } from "./orangeSliceLog";

export type OrangeSliceSearchResult = {
  searchId: string;
  resultType: "people";
  leads: AudienceLead[];
  orangeSliceSpreadsheetId?: string;
};

export function resolveAudiencePageSize(...icpTexts: string[]): number {
  const combined = icpTexts.filter(Boolean).join(" ");
  if (/\b10\s+leads\b/i.test(combined)) return 10;
  if (/\bhumanoid\b/i.test(combined)) return 30;
  return 25;
}

function fiberLeadToAudience(
  lead: Awaited<ReturnType<typeof searchFiberAudience>>["leads"][number],
): AudienceLead {
  return {
    resultType: "people",
    personName: lead.personName,
    companyName: lead.companyName,
    role: lead.role,
    socialSignal: lead.socialSignal,
    linkedinUrl: lead.linkedinUrl,
    locality: lead.locality,
    fiberSearchId: lead.fiberSearchId ?? "fiber",
  };
}

export async function searchAudienceViaOrangeSlice(
  icp: string,
  apiKey: string,
  options?: {
    pageSize?: number;
    onLead?: (lead: AudienceLead) => Promise<void>;
    fiberKey?: string;
    openaiKey?: string;
  },
): Promise<OrangeSliceSearchResult> {
  const query = icp.trim();
  if (!query) {
    throw new OrangeSliceApiError("ICP query cannot be empty.", "api_error");
  }

  const targetCount = options?.pageSize ?? resolveAudiencePageSize(query);
  const targetCompanies = getTargetCompaniesForIcp(query) ?? undefined;

  logOrangeSlice("search start (hybrid)", {
    icp: query,
    targetCount,
    fiber: Boolean(options?.fiberKey?.trim()),
  });

  const fiberPromise = options?.fiberKey?.trim()
    ? searchFiberAudience(query, options.fiberKey.trim(), { pageSize: targetCount })
        .then((result) => result.leads.map(fiberLeadToAudience))
        .catch((error) => {
          logOrangeSlice("fiber search failed", {
            error: error instanceof Error ? error.message : "fiber failed",
          });
          return [] as AudienceLead[];
        })
    : Promise.resolve([] as AudienceLead[]);

  const orangePromise = fetchAudienceFromOrangeSlice(query, apiKey, {
    pageSize: Math.max(targetCount, targetCount * 2),
    streamLeads: false,
  });

  const [fiberLeads, orangeResult] = await Promise.all([fiberPromise, orangePromise]);

  let merged = dedupeAudienceLeads([...fiberLeads, ...orangeResult.leads]);
  logOrangeSlice("search merged raw", {
    fiber: fiberLeads.length,
    orange: orangeResult.leads.length,
    total: merged.length,
  });

  merged = filterAudienceLeadsForIcp(query, merged, targetCompanies);
  logOrangeSlice("search after role/company filter", { count: merged.length });

  if (options?.openaiKey?.trim() && merged.length > 0) {
    merged = await filterAudienceLeadsByIcpRelevance(merged, query, options.openaiKey.trim());
    logOrangeSlice("search after ai relevance filter", { count: merged.length });
  }

  merged = merged.slice(0, targetCount);

  for (const lead of merged) {
    if (options?.onLead) await options.onLead(lead);
  }

  logOrangeSlice("search complete", {
    leadCount: merged.length,
    spreadsheetId: orangeResult.spreadsheetId,
    leads: merged.map(summarizeLead),
  });

  return {
    searchId: orangeResult.searchId,
    resultType: "people",
    leads: merged,
    orangeSliceSpreadsheetId: orangeResult.spreadsheetId,
  };
}

export async function attachCompanyBrandingToLeads(
  leads: AudienceLead[],
  apiKey: string,
): Promise<AudienceLead[]> {
  const cache = new Map<
    string,
    { logo?: string | null; linkedinUrl?: string | null; name?: string | null; domain?: string | null }
  >();

  return Promise.all(
    leads.map(async (lead) => {
      const companyName = lead.companyName?.trim();
      if (!companyName || isJunkCompanyName(companyName)) return lead;

      const cacheKey = (lead.companyLinkedinUrl ?? companyName).toLowerCase();
      if (!cache.has(cacheKey)) {
        try {
          const branding = await enrichCompanyBranding(apiKey, {
            companyName,
            companyLinkedinUrl: lead.companyLinkedinUrl,
          });
          cache.set(cacheKey, branding);
        } catch {
          cache.set(cacheKey, {});
        }
      }

      const branding = cache.get(cacheKey)!;
      return {
        ...lead,
        companyName: branding.name ?? companyName,
        companyLogoUrl:
          logoUrlForCompany(
            branding.name ?? companyName,
            branding.logo ?? lead.companyLogoUrl,
            branding.domain,
          ) ?? undefined,
        companyLinkedinUrl: branding.linkedinUrl ?? lead.companyLinkedinUrl,
      };
    }),
  );
}
