"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { MOCK_LEADS, type MockLeadRow } from "@/lib/mockLeads";
import { normalizeLinkedInUrl } from "@/lib/linkedinUrl";
import type { LeadRow } from "./LeadSpreadsheet";

const gridLine = "border-stone-400/25";
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

function ExpandCellIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      {expanded ? (
        <path
          d="M8 14l4-4 4 4"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 114.126 0 2.063 2.063 0 01-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function ExpandableTextCell({
  text,
  loading,
  emptyLabel = "—",
  ariaLabel,
}: {
  text: string | null | undefined;
  loading?: boolean;
  emptyLabel?: string;
  ariaLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const display = loading ? "…" : (text?.trim() || emptyLabel);
  const canExpand = !loading && display !== emptyLabel;

  return (
    <td className={`${td} max-w-[200px] align-top text-xs text-stone-500`}>
      <div
        className={`relative min-h-[2.5rem] rounded-md border border-transparent pr-5 ${
          expanded ? "border-stone-400/15 bg-stone-900/50 p-2" : ""
        }`}
      >
        <p
          className={
            expanded
              ? "whitespace-pre-wrap leading-relaxed text-stone-300"
              : "line-clamp-2 leading-snug"
          }
        >
          {display}
        </p>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-sm bg-stone-800/95 text-stone-400 shadow-sm ring-1 ring-stone-400/20 transition hover:bg-stone-700 hover:text-stone-100"
            aria-label={expanded ? `Collapse ${ariaLabel}` : `Expand ${ariaLabel}`}
            aria-expanded={expanded}
          >
            <ExpandCellIcon expanded={expanded} />
          </button>
        ) : null}
      </div>
    </td>
  );
}

function RecentActivityCell({
  activity,
  loading,
}: {
  activity: string | null | undefined;
  loading?: boolean;
}) {
  return (
    <ExpandableTextCell
      text={activity}
      loading={loading}
      ariaLabel="recent activity"
    />
  );
}

function PainSignalCell({
  painSignal,
  loading,
}: {
  painSignal: string | null | undefined;
  loading?: boolean;
}) {
  return (
    <ExpandableTextCell
      text={painSignal}
      loading={loading}
      ariaLabel="pain signal"
    />
  );
}

type SpreadsheetTableProps = {
  mode: "mock" | "live";
  mockRows?: MockLeadRow[];
  liveRows?: LeadRow[];
  selectedIds?: Set<Id<"leads">>;
  onToggleLead?: (id: Id<"leads">) => void;
  onToggleAll?: (checked: boolean) => void;
  isPreview?: boolean;
  selectionEnabled?: boolean;
};

export function SpreadsheetTable({
  mode,
  mockRows = MOCK_LEADS,
  liveRows = [],
  selectedIds = new Set(),
  onToggleLead,
  onToggleAll,
  isPreview = false,
  selectionEnabled = false,
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
                  disabled={!selectionEnabled}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-brand-blue/40 accent-brand-blue-light disabled:cursor-not-allowed disabled:opacity-40"
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
                  <RecentActivityCell activity={lead.recentActivity} />
                  <PainSignalCell painSignal={lead.painSignal} />
                  <td className={`${td} border-r-0`}>
                    <span className="rounded-full bg-stone-700/60 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                      Preview
                    </span>
                  </td>
                </tr>
              ))
            : liveRows.map((lead, index) => {
                const selected = selectedIds.has(lead._id);
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
                        disabled={!selectionEnabled}
                        onChange={() => onToggleLead?.(lead._id)}
                        className="h-4 w-4 rounded border-stone-700 accent-brand-blue disabled:cursor-not-allowed disabled:opacity-40"
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
                            href={normalizeLinkedInUrl(lead.linkedinUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded p-0.5 text-brand-blue-light transition hover:bg-brand-blue/15 hover:text-white"
                            aria-label={`${lead.personName ?? "Lead"} on LinkedIn`}
                            title="LinkedIn profile"
                          >
                            <LinkedInIcon />
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
                    <RecentActivityCell
                      activity={lead.recentActivity}
                      loading={lead.enrichmentStatus === "loading"}
                    />
                    <PainSignalCell
                      painSignal={lead.painSignal}
                      loading={
                        lead.enrichmentStatus !== "complete" &&
                        lead.enrichmentStatus !== "error" &&
                        !lead.painSignal
                      }
                    />
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
