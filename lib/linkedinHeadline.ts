/** Strip LinkedIn suffix noise from Google result titles. */
export function cleanLinkedInHeadline(title: string): string {
  return title
    .replace(/\s*[|]\s*LinkedIn\s*$/i, "")
    .replace(/\s*-\s*LinkedIn\s*$/i, "")
    .trim();
}

/** Extract person name from a LinkedIn SERP title — never trust the rest for company/role. */
export function personNameFromLinkedInTitle(title: string): string | null {
  const headline = cleanLinkedInHeadline(title);
  const dashIdx = headline.indexOf(" - ");
  const name = (dashIdx === -1 ? headline : headline.slice(0, dashIdx)).trim();
  return name.length >= 2 ? name : null;
}

export function isJunkCompanyName(name: string | null | undefined): boolean {
  const n = name?.trim();
  if (!n) return true;
  if (/^linkedin$/i.test(n)) return true;
  if (/\s-\s*linkedin\s*$/i.test(n)) return true;
  if (/linkedin\.com/i.test(n)) return true;
  if (n.length > 55) return true;
  if (/^co at /i.test(n)) return true;
  if (/^founder\s*$/i.test(n)) return true;
  if (/^roboticist/i.test(n) && !/\s(inc|labs|robotics|ai)\b/i.test(n)) return true;
  return false;
}

export function normalizeCompanyName(name: string): string {
  return name
    .replace(/\s*(\.\.\.|…)\s*$/g, "")
    .replace(/\s*-\s*LinkedIn\s*$/i, "")
    .replace(/\s+at\s+LinkedIn\s*$/i, "")
    .trim();
}

export function formatPersonRole(title?: string | null, company?: string | null): string | undefined {
  const t = title?.trim();
  const c = company?.trim();
  if (t && c) {
    if (new RegExp(`\\b(at|@)\\s+${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)) {
      return t;
    }
    return `${t} at ${c}`;
  }
  return t ?? c ?? undefined;
}
