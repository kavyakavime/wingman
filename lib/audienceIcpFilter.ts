import type { AudienceLead } from "./audienceLead";
import type { FiberAudienceLead } from "./fiber";
import {
  filterLeadsByIcpRelevance,
  filterLeadsForPeopleIcp,
  icpTargetsPeople,
  leadMatchesRequiredTitle,
} from "./icpLeadFilter";

export type TargetCompany = {
  name: string;
  domain?: string;
  linkedinUrl?: string;
};

const EXECUTIVE_ROLE =
  /\b(ceo|chief executive|cto|chief technology|founder|co-?founder|president|executive chairman|managing director)\b/i;

const JUNK_ROLE =
  /\b(head of it|senior product manager|product manager|software architect|technical co-?founder|class \d+|fellows|intern|analyst|consultant|recruiter|sales|marketing manager)\b/i;

const JUNK_COMPANY =
  /\b(stealth|kauffman|instant roofer|twst events|events|fellows|roofer)\b/i;

function toFiberLead(lead: AudienceLead): FiberAudienceLead {
  return {
    resultType: "people",
    personName: lead.personName,
    companyName: lead.companyName,
    role: lead.role,
    socialSignal: lead.socialSignal,
    linkedinUrl: lead.linkedinUrl,
    locality: lead.locality,
    fiberSearchId: lead.fiberSearchId,
  };
}

function fromFiberLead(lead: FiberAudienceLead): AudienceLead {
  return {
    resultType: "people",
    personName: lead.personName,
    companyName: lead.companyName,
    role: lead.role,
    socialSignal: lead.socialSignal,
    linkedinUrl: lead.linkedinUrl,
    locality: lead.locality,
    fiberSearchId: lead.fiberSearchId,
  };
}

export function companyNameMatchesTarget(
  companyName: string | undefined,
  targets: TargetCompany[],
): boolean {
  if (targets.length === 0) return true;
  const name = companyName?.trim().toLowerCase();
  if (!name) return false;

  return targets.some((target) => {
    const targetName = target.name.toLowerCase();
    const stems = targetName.split(/\s+/).filter((part) => part.length > 2);
    const domainStem = target.domain?.split(".")[0]?.toLowerCase();
    if (stems.some((stem) => name.includes(stem))) return true;
    if (domainStem && domainStem.length > 2 && name.includes(domainStem)) return true;
    return targetName.includes(name);
  });
}

export function leadPassesExecutiveRoleGate(icp: string, lead: AudienceLead): boolean {
  if (!icpTargetsPeople(icp)) return true;

  const role = `${lead.role ?? ""} ${lead.socialSignal ?? ""}`.trim();
  if (!role) return false;

  if (JUNK_ROLE.test(role)) return false;
  if (!EXECUTIVE_ROLE.test(role)) return false;

  return leadMatchesRequiredTitle(icp, toFiberLead(lead));
}

export function filterAudienceLeadsForIcp(
  icp: string,
  leads: AudienceLead[],
  targetCompanies?: TargetCompany[],
): AudienceLead[] {
  const peopleFiltered = filterLeadsForPeopleIcp(
    leads.map(toFiberLead),
    icp,
  ).map(fromFiberLead);

  return peopleFiltered.filter((lead) => {
    const company = `${lead.companyName ?? ""}`.toLowerCase();
    if (JUNK_COMPANY.test(company)) return false;
    if (targetCompanies?.length && !companyNameMatchesTarget(lead.companyName, targetCompanies)) {
      return false;
    }
    if (!leadPassesExecutiveRoleGate(icp, lead)) return false;
    return true;
  });
}

export async function filterAudienceLeadsByIcpRelevance(
  leads: AudienceLead[],
  icp: string,
  apiKey: string,
): Promise<AudienceLead[]> {
  if (leads.length === 0) return leads;

  const fiberLeads = leads.map(toFiberLead);
  const filtered = await filterLeadsByIcpRelevance(fiberLeads, icp, apiKey);

  if (/\bhumanoid\b/i.test(icp)) {
    const strict = new Set(
      filtered.map((lead) => lead.linkedinUrl?.toLowerCase()).filter(Boolean) as string[],
    );
    return leads.filter((lead) => strict.has(lead.linkedinUrl?.toLowerCase() ?? ""));
  }

  const keep = new Set(
    filtered.map((lead) => lead.linkedinUrl?.toLowerCase()).filter(Boolean) as string[],
  );
  return leads.filter((lead) => keep.has(lead.linkedinUrl?.toLowerCase() ?? ""));
}

export function dedupeAudienceLeads(leads: AudienceLead[]): AudienceLead[] {
  const seen = new Set<string>();
  const out: AudienceLead[] = [];
  for (const lead of leads) {
    const key = lead.linkedinUrl?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}
