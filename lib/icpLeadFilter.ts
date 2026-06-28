import type { FiberAudienceLead } from "./fiber";

export type IcpLeadVerdict = "yes" | "likely" | "partial" | "no" | "unclear";

const PEOPLE_ICP_PATTERN =
  /\b(ceo|chief executive|founder|co-?founder|president|cto|cfo|vp\b|vice president|decision.?maker|executive|people|person)\b/i;

const TITLE_PATTERNS: Array<{ icpPattern: RegExp; rolePattern: RegExp }> = [
  { icpPattern: /\bceo\b|chief executive/i, rolePattern: /\b(ceo|chief executive)\b/i },
  {
    icpPattern: /\bfounder|co-?founder\b/i,
    rolePattern: /\b(founder|co-?founder|founding)\b/i,
  },
  { icpPattern: /\bpresident\b/i, rolePattern: /\bpresident\b/i },
  { icpPattern: /\bcto\b|chief technology/i, rolePattern: /\b(cto|chief technology)\b/i },
  { icpPattern: /\bcfo\b|chief financial/i, rolePattern: /\b(cfo|chief financial)\b/i },
];

/** User ICP targets individual executives, not company lists. */
export function icpTargetsPeople(icp: string): boolean {
  return PEOPLE_ICP_PATTERN.test(icp);
}

/** Role must match a title explicitly requested in the ICP (when detectable). */
export function leadMatchesRequiredTitle(icp: string, lead: FiberAudienceLead): boolean {
  const role = `${lead.role ?? ""} ${lead.socialSignal ?? ""}`;
  if (!role.trim()) return true;

  const required = TITLE_PATTERNS.filter(({ icpPattern }) => icpPattern.test(icp));
  if (required.length === 0) return true;

  return required.some(({ rolePattern }) => rolePattern.test(role));
}

/** Drop company-only Fiber rows when the ICP asks for people/CEOs. */
export function filterLeadsForPeopleIcp(
  leads: FiberAudienceLead[],
  icp: string,
): FiberAudienceLead[] {
  const wantsPeople = icpTargetsPeople(icp);
  return leads.filter((lead) => {
    if (wantsPeople && lead.resultType === "companies") return false;
    if (wantsPeople && !leadMatchesRequiredTitle(icp, lead)) return false;
    return true;
  });
}

function leadSummaryForFilter(lead: FiberAudienceLead, index: number): string {
  const parts = [
    `#${index}`,
    lead.personName ? `Name: ${lead.personName}` : null,
    lead.companyName ? `Company: ${lead.companyName}` : null,
    lead.role ? `Role: ${lead.role}` : null,
    lead.socialSignal ? `Signal: ${lead.socialSignal.slice(0, 240)}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

/**
 * Strict ICP relevance gate — drops broad Fiber noise (e.g. generic robotics when
 * ICP asked for humanoid CEOs only).
 */
export async function filterLeadsByIcpRelevance(
  leads: FiberAudienceLead[],
  icp: string,
  apiKey: string,
): Promise<FiberAudienceLead[]> {
  if (leads.length === 0) return leads;

  const summaries = leads.map((lead, index) => leadSummaryForFilter(lead, index)).join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "icp_lead_filter",
          strict: true,
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    verdict: {
                      type: "string",
                      enum: ["yes", "likely", "partial", "no", "unclear"],
                    },
                  },
                  required: ["index", "verdict"],
                  additionalProperties: false,
                },
              },
            },
            required: ["results"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "You judge whether B2B leads match an ideal customer profile (ICP).",
            "Judge company type and role fit from the ICP and each lead's data.",
            "yes = clear match. likely = strong match with minor ambiguity.",
            "partial = related industry or adjacent category that could still be worth outreach.",
            "no = clearly wrong category (media, unrelated industry, wrong role).",
            "unclear = insufficient data — treat as partial.",
            "Prefer keeping plausible matches over rejecting borderline leads.",
          ].join(" "),
        },
        {
          role: "user",
          content: `ICP:\n${icp.trim()}\n\nLeads:\n${summaries}\n\nReturn one verdict per lead index.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ICP relevance filter failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return leads;

  const parsed = JSON.parse(raw) as {
    results: Array<{ index: number; verdict: IcpLeadVerdict }>;
  };

  const keepVerdicts = /\bhumanoid\b/i.test(icp)
    ? new Set<IcpLeadVerdict>(["yes", "likely"])
    : new Set<IcpLeadVerdict>(["yes", "likely", "partial", "unclear"]);
  const keepIndices = new Set(
    parsed.results.filter((r) => keepVerdicts.has(r.verdict)).map((r) => r.index),
  );

  if (keepIndices.size === 0) return leads;

  return leads.filter((_, index) => keepIndices.has(index));
}
