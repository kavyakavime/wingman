import { isJunkCompanyName } from "./linkedinHeadline";

/** Shared audience lead shape (Orange Slice search + legacy Fiber fields). */
export type AudienceLead = {
  resultType: "people" | "companies";
  personName?: string;
  companyName?: string;
  role?: string;
  socialSignal?: string;
  linkedinUrl?: string;
  locality?: string;
  companyLogoUrl?: string;
  companyLinkedinUrl?: string;
  fiberSearchId?: string;
};

export function filterPeopleLeads(leads: AudienceLead[]): AudienceLead[] {
  return leads.filter((lead) => {
    if (lead.resultType === "companies") return false;
    return Boolean(lead.personName?.trim() || lead.linkedinUrl?.trim());
  });
}

export function filterViableAudienceLeads(leads: AudienceLead[]): AudienceLead[] {
  const seen = new Set<string>();
  const viable: AudienceLead[] = [];

  for (const lead of filterPeopleLeads(leads)) {
    if (!lead.personName?.trim()) continue;
    if (!lead.linkedinUrl?.trim()) continue;
    if (isJunkCompanyName(lead.companyName)) continue;

    const dedupeKey = lead.linkedinUrl.trim().toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    viable.push({ ...lead, resultType: "people" });
  }

  return viable;
}
