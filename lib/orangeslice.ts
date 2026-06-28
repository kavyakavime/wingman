/**
 * Orange Slice enrichment for Wingman personas.
 * @see node_modules/orangeslice/docs/services/person/linkedin/enrich.md
 * @see node_modules/orangeslice/docs/services/company/linkedin/enrich.md
 * @see node_modules/orangeslice/docs/services/ai/generateObject.ts
 */

import { integrations, services, webBatchSearch, withApiKey } from "orangeslice";
import { post } from "orangeslice/dist/api";
import { resolveCompanyLogoUrl, logoUrlForCompany } from "./companyLogo";
import { plainTextToHtml } from "./parseRewriteDraft";
import { GmailDirectError, gmailDirectConfigured, sendViaGmailDirect } from "./gmailDirect";

export class OrangeSliceApiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_api_key"
      | "auth_failure"
      | "invalid_recipient"
      | "rate_limit"
      | "integration_not_connected"
      | "api_error",
    public readonly status?: number,
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
  recentActivity: string | null;
  personName?: string | null;
  role?: string | null;
  companyName?: string | null;
  locality?: string | null;
  companyLogoUrl?: string | null;
  companyLinkedinUrl?: string | null;
};

type B2BCompany = {
  name?: string | null;
  logo?: string | null;
  linkedin_url?: string | null;
  domain?: string | null;
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
  logo?: string | null;
  linkedin_url?: string | null;
  domain?: string | null;
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

function personRoleFromProfile(person: B2BPerson | null, lead: PersonaLeadInput): string | undefined {
  const title = person?.title?.trim();
  const company = person?.company_name?.trim() ?? lead.companyName?.trim();
  if (title && company) return `${title} at ${company}`;
  if (title) return title;
  return lead.role?.trim() || undefined;
}

/** Company logo + canonical name from Orange Slice B2B DB. */
export async function enrichCompanyBranding(
  apiKey: string,
  input: { companyName?: string; companyLinkedinUrl?: string; domain?: string },
): Promise<{ name: string | null; logo: string | null; linkedinUrl: string | null; domain: string | null }> {
  return withApiKey(apiKey.trim(), async () => {
    const url = input.companyLinkedinUrl?.trim();
    const domain = input.domain?.trim();
    const name = input.companyName?.trim();

    let company: B2BCompany | null = null;

    if (url) {
      company = (await services.company.linkedin.enrich({ url })) as B2BCompany | null;
    } else if (domain) {
      company = (await services.company.linkedin.enrich({ domain })) as B2BCompany | null;
    } else if (name) {
      const foundUrl = (await services.company.linkedin.findUrl({
        companyName: name,
      })) as string | null;
      if (foundUrl) {
        company = (await services.company.linkedin.enrich({ url: foundUrl })) as B2BCompany | null;
      }
    }

    return {
      name: company?.name?.trim() ?? name ?? null,
      logo: resolveCompanyLogoUrl(company?.logo, company?.domain),
      linkedinUrl: company?.linkedin_url?.trim() ?? url ?? null,
      domain: company?.domain?.trim() ?? null,
    };
  });
}

/** Recent public signal via Orange Slice web search. */
export async function getOrangeSliceRecentActivity(
  lead: PersonaLeadInput,
  apiKey: string,
): Promise<string | null> {
  const personName = lead.personName?.trim();
  const companyName = lead.companyName?.trim();
  if (!personName) return null;

  return withApiKey(apiKey.trim(), async () => {
    const batch = await webBatchSearch({
      queries: [
        { query: `site:linkedin.com/posts "${personName}" ${companyName ?? ""}`.trim() },
        { query: `site:linkedin.com/in "${personName}" ${companyName ?? ""}`.trim() },
      ],
    });

    for (const page of batch) {
      for (const result of page.results ?? []) {
        const snippet = result.snippet?.trim();
        if (snippet && snippet.length >= 30) {
          return snippet.slice(0, 320);
        }
      }
    }
    return null;
  });
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
    const [person, recentFromWeb] = await Promise.all([
      services.person.linkedin.enrich({
        url: linkedinUrl,
        extended: true,
      }) as Promise<B2BPerson | null>,
      getOrangeSliceRecentActivity(lead, apiKey),
    ]);

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
    const recentActivity =
      recentFromWeb ??
      person?.headline?.trim() ??
      person?.summary?.trim()?.slice(0, 240) ??
      null;
    const context = buildContextBlock({ ...lead, recentActivity }, person, company);

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
      recentActivity,
      personName: person?.name?.trim() ?? lead.personName?.trim() ?? null,
      role: personRoleFromProfile(person, lead),
      companyName: person?.company_name?.trim() ?? lead.companyName?.trim() ?? null,
      locality: person?.location?.trim() ?? lead.locality?.trim() ?? null,
      companyLogoUrl: logoUrlForCompany(
        person?.company_name?.trim() ?? lead.companyName?.trim(),
        company?.logo,
        company?.domain ?? person?.current_company_domain,
      ),
      companyLinkedinUrl:
        company?.linkedin_url?.trim() ??
        person?.current_company_linkedin_url?.trim() ??
        null,
    };
  });
}

function classifySendError(message: string, status?: number): OrangeSliceApiError {
  const lower = message.toLowerCase();

  if (isIntegrationNotConnected(message)) {
    return new OrangeSliceApiError(
      `${message} Connect Gmail with integrations.connect("gmail") — run \`npm run connect:gmail\`. OAuth only; do not use dashboard "+ Add Key" for Gmail.`,
      "integration_not_connected",
      status,
    );
  }

  if (lower.includes("composio")) {
    return new OrangeSliceApiError(
      `${message} Reconnect Gmail with integrations.connect("gmail") (\`npm run connect:gmail\`) — dashboard "Connected" can show before OAuth completes.`,
      "api_error",
      status,
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key")
  ) {
    return new OrangeSliceApiError(
      `Orange Slice auth failed: ${message}`,
      "auth_failure",
      status,
    );
  }

  if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
    return new OrangeSliceApiError(
      `Orange Slice rate limit: ${message}`,
      "rate_limit",
      status,
    );
  }

  if (
    status === 400 &&
    (lower.includes("recipient") ||
      lower.includes("invalid email") ||
      lower.includes("email address"))
  ) {
    return new OrangeSliceApiError(
      `Invalid recipient: ${message}`,
      "invalid_recipient",
      status,
    );
  }

  return new OrangeSliceApiError(message, "api_error", status);
}

function parsePostError(error: unknown): OrangeSliceApiError {
  if (error instanceof OrangeSliceApiError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/:\s(\d{3})\s/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  return classifySendError(message, status);
}

function isIntegrationNotConnected(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("no active gmail integration") ||
    lower.includes("integration not connected") ||
    lower.includes("not connected")
  );
}

async function sendViaOrangeSliceGmail(
  to: string,
  subject: string,
  body: string,
): Promise<{ messageId?: string }> {
  const { integrations: rows } = (await integrations.list({ provider: "gmail" })) as {
    integrations?: Array<{ id?: string }>;
  };
  const gmailIntegration = rows?.[0];

  const payload = {
    provider: "gmail" as const,
    method: "sendEmail" as const,
    args: [
      {
        recipient_email: to,
        subject,
        body,
        is_html: false,
      },
    ],
    ...(gmailIntegration?.id ? { integrationId: gmailIntegration.id } : {}),
  };

  const gmailResult = (await post("/execute/integration", payload)) as {
    successful?: boolean;
    error?: string;
    data?: unknown;
  };

  if (gmailResult.successful === false) {
    throw new OrangeSliceApiError(
      gmailResult.error ?? "Gmail send returned unsuccessful",
      "api_error",
    );
  }

  const data = gmailResult.data as { id?: string; messageId?: string } | undefined;
  return { messageId: data?.messageId ?? data?.id };
}

/**
 * Send a real outreach email via Orange Slice.
 *
 * Per Orange Slice docs there are two send paths:
 *
 * 1. **Gmail (primary for outreach)** — `integrations.gmail.sendEmail({ recipient_email, subject, body })`
 *    after `integrations.connect("gmail")`. See docs/integrations/gmail/sendEmail.md.
 *    Rate limit: 40 sends/day per connected Gmail account.
 *
 * 2. **Managed notification sender (fallback)** — `POST /execute/email` with `{ to, subject, html }`.
 *    Orange Slice's managed Resend identity; 0 credits. See docs/services/email/send.ts.
 *    Not exported on `services.*` in SDK v2.6.0 — call via `post()`.
 */
export async function sendOutreach(
  toEmail: string,
  subject: string,
  body: string,
  apiKey?: string,
): Promise<{ messageId?: string; via: "managed_email" | "gmail" | "gmail_direct" }> {
  const to = toEmail.trim();
  if (!to || !to.includes("@")) {
    throw new OrangeSliceApiError(
      `Invalid recipient email: "${toEmail}"`,
      "invalid_recipient",
    );
  }
  if (!subject.trim()) {
    throw new OrangeSliceApiError("Subject cannot be empty.", "api_error");
  }
  if (!body.trim()) {
    throw new OrangeSliceApiError("Body cannot be empty.", "api_error");
  }

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();

  // Primary: direct Gmail SMTP (one-click send in prod)
  if (gmailDirectConfigured()) {
    try {
      const direct = await sendViaGmailDirect(to, trimmedSubject, trimmedBody);
      return {
        messageId: direct.messageId,
        via: "gmail_direct" as const,
      };
    } catch (error) {
      if (error instanceof GmailDirectError) {
        throw new OrangeSliceApiError(error.message, "api_error");
      }
      throw error;
    }
  }

  if (!apiKey?.trim()) {
    throw new OrangeSliceApiError(
      "GMAIL_USER and GMAIL_APP_PASSWORD are not set in Convex env. " +
        "Create a Google app password, then: npx convex env set GMAIL_USER you@gmail.com && " +
        "npx convex env set GMAIL_APP_PASSWORD 'xxxx xxxx xxxx xxxx'",
      "missing_api_key",
    );
  }

  const html = plainTextToHtml(trimmedBody);
  const pathErrors: string[] = [];

  try {
    return await withApiKey(apiKey.trim(), async () => {
      try {
        const result = (await post("/execute/email", {
          to,
          subject: trimmedSubject,
          html,
        })) as { id?: string; messageId?: string };
        return {
          messageId: result.messageId ?? result.id,
          via: "managed_email" as const,
        };
      } catch (error) {
        pathErrors.push(formatPathError("Orange Slice /execute/email", error));
      }

      try {
        const gmailSend = await sendViaOrangeSliceGmail(to, trimmedSubject, trimmedBody);
        return {
          messageId: gmailSend.messageId,
          via: "gmail" as const,
        };
      } catch (error) {
        pathErrors.push(formatPathError("Orange Slice Gmail integration", error));
      }

      throw new OrangeSliceApiError(
        [
          "Could not send email — Orange Slice send endpoints are unavailable.",
          ...pathErrors,
          "Set Gmail SMTP in Convex env:",
          "npx convex env set GMAIL_USER you@gmail.com",
          "npx convex env set GMAIL_APP_PASSWORD 'xxxx xxxx xxxx xxxx'",
        ].join(" "),
        "api_error",
      );
    });
  } catch (error) {
    if (error instanceof OrangeSliceApiError) throw error;
    throw parsePostError(error);
  }
}

function formatPathError(label: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${label}: ${message.replace(/\s+/g, " ").slice(0, 220)}`;
}
