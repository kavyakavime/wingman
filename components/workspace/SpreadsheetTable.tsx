"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { MOCK_LEADS, type MockLeadRow } from "@/lib/mockLeads";
import type { LeadRow } from "./LeadSpreadsheet";

const gridLine = "border-white/30";
const th =
  `border-r ${gridLine} px-4 py-3 text-left font-semibold uppercase tracking-wide text-brand-blue-light/90`;
const td =
  `border-r ${gridLine} px-4 py-3 text-stone-400`;
const tdNum = `${td} text-center font-mono text-[11px] text-stone-400`;
const mockRow = `border-b ${gridLine} bg-stone-900/40 text-stone-400`;
const tdName = `${td} font-bold text-stone-100`;

function EnrichmentBadge({
  status,
  error,
}: {
  status: LeadRow["enrichmentStatus"] | "preview";
  error?: string | null;
}) {
  if (status === "preview") {
    return (
      <span className="rounded-full bg-brand-blue/20 px-2 py-0.5 text-[11px] font-medium text-brand-blue-light">
        Preview
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-brand-blue-light">
        <span className="h-3 w-3 animate-spin rounded-full border border-brand-blue/40 border-t-brand-blue-light" />
        Enriching
      </span>
    );
  }
  if (status === "complete") {
    return <span className="text-xs font-medium text-emerald-600">Enriched</span>;
  }
  if (status === "error") {
    return (
      <span className="text-xs text-red-600" title={error ?? undefined}>
        Error
      </span>
    );
  }
  return <span className="text-xs text-brand-blue-light/70">Pending</span>;
}

type SpreadsheetTableProps = {
  mode: "mock" | "live";
  mockRows?: MockLeadRow[];
  liveRows?: LeadRow[];
  selectedIds?: Set<Id<"leads">>;
  onToggleLead?: (id: Id<"leads">) => void;
  onToggleAll?: (checked: boolean) => void;
  isPreview?: boolean;
};

export function SpreadsheetTable({
  mode,
  mockRows = MOCK_LEADS,
  liveRows = [],
  selectedIds = new Set(),
  onToggleLead,
  onToggleAll,
  isPreview = false,
}: SpreadsheetTableProps) {
  const allSelected =
    mode === "live" &&
    liveRows.length > 0 &&
    liveRows.every((lead) => selectedIds.has(lead._id));
  const someSelected =
    mode === "live" && liveRows.some((lead) => selectedIds.has(lead._id));

  return (
    <div className="p-3">
      <table className={`w-full min-w-[820px] overflow-hidden rounded-lg border ${gridLine} border-collapse text-left text-[13px] shadow-sm`}>
        <thead className={`sticky top-0 z-10 border-b ${gridLine} bg-gradient-to-b from-brand-blue/25 to-brand-blue/10 text-[11px]`}>
          <tr>
            <th className={`${th} w-11 text-center`}>#</th>
            <th className={`${th} w-11 text-center`}>
              {mode === "live" && onToggleAll ? (
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-brand-blue/40 accent-brand-blue-light"
                  aria-label="Select all leads"
                />
              ) : (
                <span className="sr-only">Select</span>
              )}
            </th>
            <th className={th}>Name</th>
            <th className={th}>Role</th>
            <th className={th}>Company</th>
            <th className={th}>Location</th>
            <th className={th}>Recent activity</th>
            <th className={th}>Pain signal</th>
            <th className={`${th} border-r-0`}>Enrich</th>
          </tr>
        </thead>
        <tbody>
          {mode === "mock"
            ? mockRows.map((lead, index) => (
                <tr key={lead.id} className={mockRow}>
                  <td className={tdNum}>{index + 1}</td>
                  <td className={`${td} text-center`}>
                    <input
                      type="checkbox"
                      checked
                      disabled
                      className="h-4 w-4 rounded border-stone-700 opacity-50"
                      aria-label={`Preview ${lead.personName}`}
                    />
                  </td>
                  <td className={tdName}>{lead.personName}</td>
                  <td className={`${td} max-w-[160px] truncate`}>{lead.role}</td>
                  <td className={`${td} max-w-[130px] truncate font-medium text-stone-300`}>
                    {lead.companyName}
                  </td>
                  <td className={`${td} max-w-[110px] truncate text-xs text-stone-500`}>
                    {lead.locality}
                  </td>
                  <td className={`${td} max-w-[200px] truncate text-xs text-stone-500`}>
                    {lead.recentActivity}
                  </td>
                  <td className={`${td} max-w-[160px] truncate text-xs text-stone-500`}>
                    {lead.painSignal}
                  </td>
                  <td className={`${td} border-r-0`}>
                    <span className="rounded-full bg-stone-700/60 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                      Preview
                    </span>
                  </td>
                </tr>
              ))
            : liveRows.map((lead, index) => {
                const selected = selectedIds.has(lead._id);
                const activity = lead.recentActivity ?? lead.painSignal;
                return (
                  <tr
                    key={lead._id}
                    className={`border-b ${gridLine} transition ${
                      selected
                        ? "bg-cream-deep text-stone-100"
                        : "bg-stone-800/40 text-stone-400"
                    } hover:bg-stone-800/50`}
                  >
                    <td className={tdNum}>{index + 1}</td>
                    <td className={`${td} text-center`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleLead?.(lead._id)}
                        className="h-4 w-4 rounded border-stone-700 accent-brand-blue"
                        aria-label={`Select ${lead.personName ?? "lead"}`}
                      />
                    </td>
                    <td className={td}>
                      <div className="flex max-w-[150px] items-center gap-1.5">
                        <span className="truncate font-bold text-stone-100" title={lead.personName ?? undefined}>
                          {lead.personName ?? "—"}
                        </span>
                        {lead.linkedinUrl ? (
                          <a
                            href={lead.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-[10px] font-medium text-brand-blue-light hover:underline"
                          >
                            in
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={`${td} max-w-[160px] truncate`}
                      title={lead.role ?? undefined}
                    >
                      {lead.role ?? "—"}
                    </td>
                    <td
                      className={`${td} max-w-[130px] truncate font-medium text-stone-300`}
                      title={lead.companyName ?? undefined}
                    >
                      {lead.companyName ?? "—"}
                    </td>
                    <td
                      className={`${td} max-w-[110px] truncate text-xs`}
                      title={lead.locality ?? undefined}
                    >
                      {lead.locality ?? "—"}
                    </td>
                    <td
                      className={`${td} max-w-[200px] truncate text-xs text-stone-500`}
                      title={activity ?? undefined}
                    >
                      {activity ??
                        (lead.enrichmentStatus === "loading"
                          ? "…"
                          : lead.enrichmentStatus === "complete"
                            ? "—"
                            : "—")}
                    </td>
                    <td
                      className={`${td} max-w-[160px] truncate text-xs`}
                      title={lead.painSignal ?? undefined}
                    >
                      {lead.painSignal ??
                        (lead.enrichmentStatus === "complete" ? "—" : "…")}
                    </td>
                    <td className={`${td} border-r-0`}>
                      <EnrichmentBadge
                        status={lead.enrichmentStatus}
                        error={lead.enrichmentError}
                      />
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
