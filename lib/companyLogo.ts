/** Google favicon — reliable fallback when B2B DB / Clearbit logos are missing or dead. */
export function faviconLogoUrl(domain: string): string {
  const host = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

const KNOWN_COMPANY_DOMAINS: Record<string, string> = {
  brex: "brex.com",
  canva: "canva.com",
  databricks: "databricks.com",
  deel: "deel.com",
  figma: "figma.com",
  glean: "glean.com",
  instacart: "instacart.com",
  notion: "notion.so",
  okta: "okta.com",
  ramp: "ramp.com",
  rippling: "rippling.com",
  snowflake: "snowflake.com",
  stripe: "stripe.com",
  zoom: "zoom.us",
  zoominfo: "zoominfo.com",
};

/** Best-effort domain for favicon when Orange Slice has no logo/domain. */
export function guessCompanyDomain(companyName: string): string | null {
  const key = companyName.trim().toLowerCase();
  if (!key) return null;
  if (KNOWN_COMPANY_DOMAINS[key]) return KNOWN_COMPANY_DOMAINS[key];
  const slug = key.replace(/[^a-z0-9]/g, "");
  return slug.length >= 2 ? `${slug}.com` : null;
}

export function resolveCompanyLogoUrl(
  logo: string | null | undefined,
  domain?: string | null,
): string | null {
  const trimmed = logo?.trim();
  if (trimmed) return trimmed;
  const d = domain?.trim();
  if (!d) return null;
  return faviconLogoUrl(d);
}

export function logoUrlForCompany(
  companyName: string | null | undefined,
  logo?: string | null,
  domain?: string | null,
): string | null {
  const guessed = domain?.trim() || (companyName ? guessCompanyDomain(companyName) : null);
  return resolveCompanyLogoUrl(logo, guessed);
}
