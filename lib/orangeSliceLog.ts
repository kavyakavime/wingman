const LOG_PREFIX = "[orangeSlice]";
const MAX_JSON_CHARS = 12_000;

function truncateJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= MAX_JSON_CHARS) return text;
  return `${text.slice(0, MAX_JSON_CHARS)}\n… (truncated ${text.length - MAX_JSON_CHARS} chars)`;
}

/** Structured Orange Slice debug output — visible in `npx convex dev` and Convex dashboard logs. */
export function logOrangeSlice(stage: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${stage}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${stage}\n${truncateJson(data)}`);
}

export function summarizeLead(lead: {
  personName?: string | null;
  companyName?: string | null;
  role?: string | null;
  linkedinUrl?: string | null;
  locality?: string | null;
}) {
  return {
    personName: lead.personName ?? null,
    companyName: lead.companyName ?? null,
    role: lead.role ?? null,
    linkedinUrl: lead.linkedinUrl ?? null,
    locality: lead.locality ?? null,
  };
}
