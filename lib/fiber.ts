/**
 * Fiber AI — natural-language audience search.
 * @see https://api.fiber.ai/llms.txt
 * @see https://api.fiber.ai/ai-docs/slushieRun.md  (POST /v1/nlp-search/run)
 */

const FIBER_API_BASE = "https://api.fiber.ai";

export class FiberApiError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_api_key" | "unauthorized" | "rate_limit" | "api_error",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FiberApiError";
  }
}

/** Normalized lead row derived from Fiber NLP search results. */
export type FiberAudienceLead = {
  resultType: "people" | "companies";
  personName?: string;
  companyName?: string;
  role?: string;
  socialSignal?: string;
  linkedinUrl?: string;
  locality?: string;
  fiberSearchId?: string;
};

export type FiberSearchAudienceResult = {
  searchId: string;
  resultType: "people" | "companies";
  leads: FiberAudienceLead[];
  notices: string[];
};

type FiberNlpSearchResponse = {
  output?: {
    searchId?: string;
    nextPageToken?: string | null;
    notices?: Array<string | { message?: string; text?: string }> | null;
    results?:
      | {
          resultType: "people";
          people?: FiberPerson[] | null;
        }
      | {
          resultType: "companies";
          companies?: FiberCompany[] | null;
        };
  };
  error?: string;
  message?: string;
};

type FiberPerson = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  summary?: string | null;
  url?: string | null;
  locality?: string | null;
  open_to_work?: boolean | null;
  is_hiring?: boolean | null;
  current_job?: FiberCurrentJob | null;
  experiences?: Array<{ title?: string | null; company_name?: string | null; is_current?: boolean | null }> | null;
};

type FiberCompany = {
  preferred_name?: string | null;
  names?: string[] | null;
  li_headline?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  li_description?: string | null;
  linkedin_primary_slug?: string | null;
  websites?: string[] | null;
  funding_stage?: string | null;
  latest_funding_consensus?: number | null;
};

type FiberCurrentJob = {
  title?: string | null;
  company_name?: string | null;
  company?: { name?: string | null } | null;
};

function personDisplayName(person: FiberPerson): string | undefined {
  if (person.name?.trim()) return person.name.trim();
  const parts = [person.first_name, person.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ").trim();
  return undefined;
}

function personRole(person: FiberPerson): string | undefined {
  const job = person.current_job;
  if (job && typeof job === "object") {
    const title = job.title?.trim();
    const company =
      job.company_name?.trim() ??
      (typeof job.company === "object" ? job.company?.name?.trim() : undefined);
    if (title && company) return `${title} at ${company}`;
    if (title) return title;
    if (company) return company;
  }

  const currentExp = person.experiences?.find((e) => e.is_current) ?? person.experiences?.[0];
  if (currentExp) {
    const title = currentExp.title?.trim();
    const company = currentExp.company_name?.trim();
    if (title && company) return `${title} at ${company}`;
    if (title) return title;
  }

  return person.headline?.trim() || undefined;
}

function personCompanyName(person: FiberPerson): string | undefined {
  const job = person.current_job;
  if (job && typeof job === "object") {
    return (
      job.company_name?.trim() ??
      (typeof job.company === "object" ? job.company?.name?.trim() : undefined)
    );
  }
  const currentExp = person.experiences?.find((e) => e.is_current) ?? person.experiences?.[0];
  return currentExp?.company_name?.trim() || undefined;
}

/** Case-insensitive mutual contains match for lookup key vs Fiber company string. */
function companyNamesMatch(lookupCompany: string, experienceCompany: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const lookup = normalize(lookupCompany);
  const experience = normalize(experienceCompany);
  if (!lookup || !experience) return false;
  return lookup.includes(experience) || experience.includes(lookup);
}

type FiberExperience = NonNullable<FiberPerson["experiences"]>[number];

function findExperienceForLookupCompany(
  person: FiberPerson,
  lookupCompanyName: string,
): FiberExperience | undefined {
  return person.experiences?.find(
    (entry) =>
      entry.company_name?.trim() &&
      companyNamesMatch(lookupCompanyName, entry.company_name),
  );
}

/**
 * When forceCompanyMatch keyed on lookupCompanyName, prefer the matching
 * experiences[] row over current_job (handles concurrent current roles).
 */
function personCompanyAndRoleForLookup(
  person: FiberPerson,
  lookupCompanyName: string,
): { companyName?: string; role?: string } {
  const matched = findExperienceForLookupCompany(person, lookupCompanyName);
  if (matched) {
    const company = matched.company_name?.trim();
    const title = matched.title?.trim();
    return {
      companyName: company,
      role: title && company ? `${title} at ${company}` : title ?? company,
    };
  }

  return {
    companyName: personCompanyName(person),
    role: personRole(person),
  };
}

function mapPersonForCompanyLookup(
  person: FiberPerson,
  lookupCompanyName: string,
  searchId: string,
): FiberAudienceLead {
  const { companyName, role } = personCompanyAndRoleForLookup(person, lookupCompanyName);
  return {
    resultType: "people",
    personName: personDisplayName(person),
    companyName,
    role,
    socialSignal: personSocialSignal(person),
    linkedinUrl: person.url?.trim() || undefined,
    locality: person.locality?.trim() || undefined,
    fiberSearchId: searchId,
  };
}

function personSocialSignal(person: FiberPerson): string | undefined {
  const signals: string[] = [];
  if (person.headline?.trim()) signals.push(person.headline.trim());
  if (person.summary?.trim()) signals.push(person.summary.trim());
  if (person.open_to_work) signals.push("Open to work");
  if (person.is_hiring) signals.push("Hiring");
  if (signals.length === 0) return undefined;
  return signals.join(" · ");
}

function companyDisplayName(company: FiberCompany): string | undefined {
  return (
    company.preferred_name?.trim() ??
    company.names?.find((n) => n.trim())?.trim() ??
    undefined
  );
}

function companySocialSignal(company: FiberCompany): string | undefined {
  const signals: string[] = [];
  if (company.li_headline?.trim()) signals.push(company.li_headline.trim());
  if (company.short_description?.trim()) signals.push(company.short_description.trim());
  else if (company.li_description?.trim()) signals.push(company.li_description.trim());
  else if (company.long_description?.trim()) signals.push(company.long_description.trim());
  if (company.funding_stage?.trim()) signals.push(`Funding: ${company.funding_stage.trim()}`);
  if (signals.length === 0) return undefined;
  return signals.join(" · ");
}

function companyLinkedinUrl(company: FiberCompany): string | undefined {
  const slug = company.linkedin_primary_slug?.trim();
  if (!slug) return undefined;
  return `https://www.linkedin.com/company/${slug}`;
}

function normalizeNotices(
  notices?: Array<string | { message?: string; text?: string }> | null,
): string[] {
  if (!notices?.length) return [];
  return notices
    .map((n) => {
      if (typeof n === "string") return n;
      return n.message ?? n.text ?? "";
    })
    .filter(Boolean);
}

function mapPeople(searchId: string, people: FiberPerson[]): FiberAudienceLead[] {
  return people.map((person) => ({
    resultType: "people" as const,
    personName: personDisplayName(person),
    companyName: personCompanyName(person),
    role: personRole(person),
    socialSignal: personSocialSignal(person),
    linkedinUrl: person.url?.trim() || undefined,
    locality: person.locality?.trim() || undefined,
    fiberSearchId: searchId,
  }));
}

function mapCompanies(searchId: string, companies: FiberCompany[]): FiberAudienceLead[] {
  return companies.map((company) => ({
    resultType: "companies" as const,
    companyName: companyDisplayName(company),
    socialSignal: companySocialSignal(company),
    linkedinUrl: companyLinkedinUrl(company),
    fiberSearchId: searchId,
  }));
}

/**
 * Fiber page size from ICP copy. Testing hook: "10 leads" → 10, otherwise 25.
 */
export function resolveFiberPageSize(...icpTexts: string[]): number {
  const combined = icpTexts.filter(Boolean).join(" ");
  if (/\b10\s+leads\b/i.test(combined)) return 10;
  return 25;
}

/**
 * Search Fiber for real companies/people matching a plain-English ICP.
 * Uses POST /v1/nlp-search/run (slushieRun).
 */
export async function searchAudience(
  icp: string,
  apiKey: string,
  options?: { pageSize?: number },
): Promise<FiberSearchAudienceResult> {
  const query = icp.trim();
  if (!query) {
    throw new FiberApiError("ICP query cannot be empty.", "api_error");
  }

  if (!apiKey.trim()) {
    throw new FiberApiError(
      "FIBER_API_KEY is not configured. Set it with: npx convex env set FIBER_API_KEY your_key",
      "missing_api_key",
    );
  }

  const response = await fetch(`${FIBER_API_BASE}/v1/nlp-search/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
    },
    body: JSON.stringify({
      apiKey: apiKey.trim(),
      query,
      pageSize: options?.pageSize ?? 25,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new FiberApiError(
      "Invalid Fiber API key. Check FIBER_API_KEY in Convex env.",
      "unauthorized",
      response.status,
    );
  }

  if (response.status === 429) {
    throw new FiberApiError(
      "Fiber rate limit exceeded (120 req/min on NLP search). Wait and try again.",
      "rate_limit",
      response.status,
    );
  }

  let body: FiberNlpSearchResponse;
  try {
    body = (await response.json()) as FiberNlpSearchResponse;
  } catch {
    throw new FiberApiError(
      `Fiber returned a non-JSON response (HTTP ${response.status}).`,
      "api_error",
      response.status,
    );
  }

  if (!response.ok) {
    const detail = body.message ?? body.error ?? response.statusText;
    throw new FiberApiError(
      `Fiber API error (HTTP ${response.status}): ${detail}`,
      "api_error",
      response.status,
    );
  }

  const output = body.output;
  if (!output?.searchId || !output.results) {
    throw new FiberApiError(
      "Fiber returned an unexpected response shape (missing searchId or results).",
      "api_error",
      response.status,
    );
  }

  const notices = normalizeNotices(output.notices);
  const { resultType } = output.results;

  if (resultType === "people") {
    const people = output.results.people ?? [];
    return {
      searchId: output.searchId,
      resultType: "people",
      leads: mapPeople(output.searchId, people),
      notices,
    };
  }

  const companies = output.results.companies ?? [];
  return {
    searchId: output.searchId,
    resultType: "companies",
    leads: mapCompanies(output.searchId, companies),
    notices,
  };
}

// ── Deterministic person lookup (kitchen-sink) ────────────────────────────────
// @see https://api.fiber.ai/ai-docs/KitchenSinkProfile.md  (POST /v1/kitchen-sink/person)

export type PersonLookupInput = {
  personName: string;
  companyName: string;
  companyDomain?: string;
};

/**
 * Resolve a specific person by name + current company via Fiber kitchen-sink.
 * Uses forceCompanyMatch so name-only collisions are rejected.
 */
export async function lookupPersonByNameAndCompany(
  input: PersonLookupInput,
  apiKey: string,
): Promise<FiberAudienceLead> {
  const personName = input.personName.trim();
  const companyName = input.companyName.trim();
  if (!personName || !companyName) {
    throw new FiberApiError(
      "personName and companyName are required for kitchen-sink lookup.",
      "api_error",
    );
  }

  const body: Record<string, unknown> = {
    personName: { value: personName },
    companyName: { value: companyName },
    forceCompanyMatch: true,
    numProfiles: 1,
  };

  const domain = input.companyDomain?.trim();
  if (domain) {
    body.companyDomain = { value: domain };
  }

  const response = await fiberPost<{ output?: { data?: FiberPerson[] | null } }>(
    apiKey,
    "/v1/kitchen-sink/person",
    body,
  );

  const people = response.output?.data ?? [];
  if (people.length === 0) {
    throw new FiberApiError(
      `No Fiber profile found for "${personName}" at "${companyName}".`,
      "api_error",
    );
  }

  const person = people[0];
  if (!person) {
    throw new FiberApiError(
      `Fiber returned an empty profile for "${personName}" at "${companyName}".`,
      "api_error",
    );
  }

  return mapPersonForCompanyLookup(person, companyName, "kitchen-sink");
}

// ── LinkedIn live activity ───────────────────────────────────────────────────
// @see https://api.fiber.ai/ai-docs/profileLatestActivitiesLiveFetch.md
// @see https://api.fiber.ai/ai-docs/profilePostsLiveFetch.md

export type FiberActivitySource = "latest_activities" | "posts" | "none";

export type FiberLatestActivityResult = {
  recentActivity: string | null;
  activitySource: FiberActivitySource;
  lastActivityAt: string | null;
};

type FiberActivityItem = {
  activityType?: string;
  occurredAt?: string;
  content?: string | null;
};

type FiberPostItem = {
  caption?: string | null;
  subText?: string | null;
  postedAt?: {
    noLaterThan?: string | null;
    noEarlierThan?: string | null;
  } | null;
};

type FiberLiveFetchResponse<T> = {
  output?: T;
  error?: string;
  message?: string;
};

async function fiberPost<T>(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!apiKey.trim()) {
    throw new FiberApiError(
      "FIBER_API_KEY is not configured. Set it with: npx convex env set FIBER_API_KEY your_key",
      "missing_api_key",
    );
  }

  const response = await fetch(`${FIBER_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
    },
    body: JSON.stringify({ apiKey: apiKey.trim(), ...body }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new FiberApiError(
      "Invalid Fiber API key. Check FIBER_API_KEY in Convex env.",
      "unauthorized",
      response.status,
    );
  }

  if (response.status === 429) {
    throw new FiberApiError(
      "Fiber rate limit exceeded. Wait and try again.",
      "rate_limit",
      response.status,
    );
  }

  let payload: FiberLiveFetchResponse<T> & T;
  try {
    payload = (await response.json()) as FiberLiveFetchResponse<T> & T;
  } catch {
    throw new FiberApiError(
      `Fiber returned a non-JSON response (HTTP ${response.status}).`,
      "api_error",
      response.status,
    );
  }

  if (!response.ok) {
    const detail = payload.message ?? payload.error ?? response.statusText;
    throw new FiberApiError(
      `Fiber API error (HTTP ${response.status}): ${detail}`,
      "api_error",
      response.status,
    );
  }

  return payload;
}

function isSubstantiveText(text: string | null | undefined): text is string {
  return typeof text === "string" && text.trim().length >= 20;
}

function formatActivity(activity: FiberActivityItem): string | null {
  const content = activity.content?.trim();
  if (!isSubstantiveText(content)) return null;
  const type = activity.activityType ?? "activity";
  const when = activity.occurredAt ? ` (${activity.occurredAt})` : "";
  return `[${type}]${when}: ${content}`;
}

function formatPost(post: FiberPostItem): string | null {
  const text = post.caption?.trim() || post.subText?.trim();
  if (!isSubstantiveText(text)) return null;
  const when =
    post.postedAt?.noLaterThan ??
    post.postedAt?.noEarlierThan ??
    null;
  return when ? `[post] (${when}): ${text}` : `[post]: ${text}`;
}

/**
 * Fetch the most recent substantive LinkedIn activity for a profile.
 * Tries profile-latest-activities first, then profile-posts fallback.
 */
export async function getLatestActivity(
  linkedinUrl: string,
  apiKey: string,
): Promise<FiberLatestActivityResult> {
  const identifier = linkedinUrl.trim();
  if (!identifier) {
    throw new FiberApiError("LinkedIn URL is required for activity fetch.", "api_error");
  }

  const latest = await fiberPost<{ output?: {
    lastActivityAt?: string | null;
    activities?: FiberActivityItem[] | null;
  } }>(apiKey, "/v1/linkedin-live-fetch/profile-latest-activities", {
    identifier,
  });

  const activities = latest.output?.activities ?? [];
  for (const activity of activities) {
    const formatted = formatActivity(activity);
    if (formatted) {
      return {
        recentActivity: formatted,
        activitySource: "latest_activities",
        lastActivityAt: latest.output?.lastActivityAt ?? activity.occurredAt ?? null,
      };
    }
  }

  const postsResponse = await fiberPost<{ output?: {
    data?: FiberPostItem[] | null;
  } }>(apiKey, "/v1/linkedin-live-fetch/profile-posts", {
    identifier,
  });

  const posts = postsResponse.output?.data ?? [];
  for (const post of posts) {
    const formatted = formatPost(post);
    if (formatted) {
      const when =
        post.postedAt?.noLaterThan ??
        post.postedAt?.noEarlierThan ??
        null;
      return {
        recentActivity: formatted,
        activitySource: "posts",
        lastActivityAt: when,
      };
    }
  }

  return {
    recentActivity: null,
    activitySource: "none",
    lastActivityAt: latest.output?.lastActivityAt ?? null,
  };
}
