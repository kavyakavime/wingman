/**
 * Orange Slice enrichment for Wingman personas.
 * @see node_modules/orangeslice/docs/services/person/linkedin/enrich.md
 * @see node_modules/orangeslice/docs/services/company/linkedin/enrich.md
 * @see node_modules/orangeslice/docs/services/ai/generateObject.ts
 */

import { services, withApiKey } from "orangeslice";

export class OrangeSliceApiError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_api_key" | "api_error",
  ) {
    super(message);
    this.name = "OrangeSliceApiError";
  }
}

export type PersonaLeadInput = {
  personName?: string;
  companyName?: string;
  role?: string;
  socialSignal?: string;
  linkedinUrl?: string;
  locality?: string;
  recentActivity?: string | null;
};

export type PersonaEnrichment = {
  fundingStage: string | null;
  painSignal: string | null;
  intentScore: number | null;
};

type B2BPerson = {
  name?: string | null;
  title?: string | null;
  company_name?: string | null;
  headline?: string | null;
  summary?: string | null;
  current_company_domain?: string | null;
  current_company_linkedin_url?: string | null;
  location?: string | null;
};

type FundingRound = {
  round_name?: string | null;
  round_date?: string | null;
  round_amount?: number | null;
};

type B2BCompanyExtended = {
  name?: string | null;
  description?: string | null;
  employee_count?: number | null;
  employee_growth_12mo?: number | null;
  crunchbase_funding?: FundingRound[] | null;
};

function latestFundingStage(company: B2BCompanyExtended | null): string | null {
  const rounds = company?.crunchbase_funding;
  if (!rounds?.length) return null;

  const sorted = [...rounds].sort((a, b) => {
    const aDate = a.round_date ?? "";
    const bDate = b.round_date ?? "";
    return bDate.localeCompare(aDate);
  });

  const latest = sorted.find((r) => r.round_name?.trim());
  if (!latest?.round_name) return null;

  const parts = [latest.round_name.trim()];
  if (latest.round_date) parts.push(latest.round_date);
  if (latest.round_amount != null) {
    parts.push(`$${Math.round(latest.round_amount).toLocaleString()}`);
  }
  return parts.join(" · ");
}

function buildContextBlock(
  lead: PersonaLeadInput,
  person: B2BPerson | null,
  company: B2BCompanyExtended | null,
): string {
  return [
    `Person: ${lead.personName ?? person?.name ?? "unknown"}`,
    `Role: ${lead.role ?? person?.title ?? "unknown"}`,
    `Company: ${lead.companyName ?? person?.company_name ?? "unknown"}`,
    `Location: ${lead.locality ?? person?.location ?? "unknown"}`,
    `Headline: ${lead.socialSignal ?? person?.headline ?? "none"}`,
    `Summary: ${person?.summary ?? "none"}`,
    `Recent LinkedIn activity: ${lead.recentActivity ?? "none found"}`,
    `Company description: ${company?.description ?? "none"}`,
    `Employees: ${company?.employee_count ?? "unknown"}`,
    `YoY headcount growth: ${company?.employee_growth_12mo ?? "unknown"}`,
    `Funding (Orange Slice company data): ${latestFundingStage(company) ?? "unknown"}`,
  ].join("\n");
}

/**
 * Enrich a persona with funding stage, pain signal, and intent score.
 * Requires a LinkedIn URL — avoids findUrl/Serper lookups.
 */
export async function enrichPersona(
  lead: PersonaLeadInput,
  apiKey: string,
): Promise<PersonaEnrichment> {
  if (!apiKey.trim()) {
    throw new OrangeSliceApiError(
      "ORANGESLICE_API_KEY is not configured. Set it with: npx convex env set ORANGESLICE_API_KEY your_key",
      "missing_api_key",
    );
  }

  const linkedinUrl = lead.linkedinUrl?.trim();
  if (!linkedinUrl) {
    throw new OrangeSliceApiError(
      "LinkedIn URL is required for Orange Slice enrichment.",
      "api_error",
    );
  }

  return withApiKey(apiKey.trim(), async () => {
    const person = (await services.person.linkedin.enrich({
      url: linkedinUrl,
      extended: true,
    })) as B2BPerson | null;

    let company: B2BCompanyExtended | null = null;
    if (person?.current_company_linkedin_url) {
      company = (await services.company.linkedin.enrich({
        url: person.current_company_linkedin_url,
        extended: true,
      })) as B2BCompanyExtended | null;
    } else if (person?.current_company_domain) {
      company = (await services.company.linkedin.enrich({
        domain: person.current_company_domain,
        extended: true,
      })) as B2BCompanyExtended | null;
    }

    const fundingFromCompany = latestFundingStage(company);
    const context = buildContextBlock(lead, person, company);

    const { object } = await services.ai.generateObject({
      prompt: `You are enriching a B2B sales persona for outbound testing.

Use ONLY the facts below. Do not invent funding rounds, pain points, or intent signals not supported by the data.
If recent LinkedIn activity is "none found", do not pretend there was activity.
If funding is unknown, return null for fundingStage.

Return:
- fundingStage: latest funding stage/round if known from the data (e.g. "Series B · 2024-03-01"), else null
- painSignal: one concrete likely pain based on role + company context (1 sentence), or null if insufficient data
- intentScore: integer 0-100 for outbound reply likelihood based ONLY on role fit + any real activity signal (0 if no signal)

Context:
${context}`,
      schema: {
        type: "object",
        properties: {
          fundingStage: { type: ["string", "null"] },
          painSignal: { type: ["string", "null"] },
          intentScore: { type: ["number", "null"] },
        },
        required: ["fundingStage", "painSignal", "intentScore"],
      },
    });

    const parsed = object as {
      fundingStage?: string | null;
      painSignal?: string | null;
      intentScore?: number | null;
    };

    const intentScore =
      typeof parsed.intentScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.intentScore)))
        : null;

    return {
      fundingStage: fundingFromCompany ?? parsed.fundingStage?.trim() ?? null,
      painSignal: parsed.painSignal?.trim() ?? null,
      intentScore,
    };
  });
}
