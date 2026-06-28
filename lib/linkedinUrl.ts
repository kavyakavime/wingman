/** Ensure LinkedIn profile URLs open externally, not as site-relative paths. */
export function normalizeLinkedInUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  const withoutLeadingSlashes = trimmed.replace(/^\/+/, "");
  return `https://${withoutLeadingSlashes}`;
}
