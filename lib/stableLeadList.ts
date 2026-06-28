import type { LeadRow } from "@/components/workspace/LeadSpreadsheet";

type RunStatus = "loading" | "complete" | "empty" | "error" | null | undefined;

/**
 * Keep the last non-empty lead list visible while Convex reloads or a run is
 * still in flight, so the spreadsheet never flashes blank mid-enrichment/search.
 */
export function resolveStableLeadList(
  leads: LeadRow[] | undefined,
  cachedLeads: LeadRow[],
  runStatus: RunStatus,
): LeadRow[] {
  if (leads !== undefined) {
    if (leads.length > 0) return leads;
    if (runStatus === "empty" || runStatus === "error") return [];
  }
  return cachedLeads;
}

export function nextCachedLeadList(
  leads: LeadRow[] | undefined,
  runStatus: RunStatus,
  currentCache: LeadRow[],
): LeadRow[] {
  if (leads === undefined) return currentCache;
  if (leads.length > 0) return leads;
  if (runStatus === "empty" || runStatus === "error") return [];
  return currentCache;
}
