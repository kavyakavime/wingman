"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { SpreadsheetTable } from "./SpreadsheetTable";

export type LeadRow = {
  _id: Id<"leads">;
  personName?: string | null;
  companyName?: string | null;
  role?: string | null;
  locality?: string | null;
  linkedinUrl?: string | null;
  painSignal?: string | null;
  recentActivity?: string | null;
  enrichmentStatus?: "pending" | "loading" | "complete" | "error" | null;
  enrichmentError?: string | null;
};

type LeadSpreadsheetProps = {
  hasLiveLeads: boolean;
  hasSearched: boolean;
  isSearching: boolean;
  runStatus: "loading" | "complete" | "empty" | "error" | null;
  leads: LeadRow[] | undefined;
  selectedIds: Set<Id<"leads">>;
  onToggleLead: (id: Id<"leads">) => void;
  onToggleAll: (checked: boolean) => void;
  onEnrichAll: () => Promise<void>;
  isEnriching: boolean;
  enrichComplete: boolean;
  enrichPopupDismissed: boolean;
  onEnrichPopupDismissedChange: (dismissed: boolean) => void;
};

function EnrichIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M5 19l1.2-3.6L9.8 14l-3.6-1.2L5 9.2 3.8 12.8 0.2 14l3.6 1.2L5 19zM19 19l1.2-3.6L23.8 14l-3.6-1.2L19 9.2l-1.2 3.6-3.6 1.2 3.6 1.2L19 19z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

function EnrichPopup({
  leadCount,
  doneCount,
  isEnriching,
  enrichInProgress,
  onEnrich,
  onDismiss,
}: {
  leadCount: number;
  doneCount: number;
  isEnriching: boolean;
  enrichInProgress: boolean;
  onEnrich: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
      <div
        role="dialog"
        aria-label="Enrich leads"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-brand-blue/25 bg-cream-deep p-4 shadow-xl shadow-brand-blue/15 ring-1 ring-brand-blue/10"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue-light">
            {enrichInProgress ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-blue/20 border-t-brand-blue" />
            ) : (
              <EnrichIcon />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-stone-100">
              {enrichInProgress ? "Enriching leads…" : "Enrich your leads"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
              {enrichInProgress
                ? doneCount >= leadCount
                  ? "Finishing up…"
                  : `Pulling live signals for every lead (${doneCount}/${leadCount}).`
                : `${leadCount} leads loaded from Fiber — enrich before simulating.`}
            </p>
            {!enrichInProgress ? (
              <button
                type="button"
                onClick={onEnrich}
                disabled={isEnriching}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue/90 disabled:opacity-50"
              >
                <EnrichIcon />
                Enrich all {leadCount} leads
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
            className="shrink-0 rounded-md p-1 text-stone-400 transition hover:bg-stone-800 hover:text-stone-300"
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadSpreadsheet({
  hasLiveLeads,
  hasSearched,
  isSearching,
  runStatus,
  leads,
  selectedIds,
  onToggleLead,
  onToggleAll,
  onEnrichAll,
  isEnriching,
  enrichComplete,
  enrichPopupDismissed,
  onEnrichPopupDismissedChange,
}: LeadSpreadsheetProps) {
  const leadList = leads ?? [];
  const showMock = !hasLiveLeads && !hasSearched;
  const showEmpty = hasSearched && !hasLiveLeads && runStatus === "empty" && !isSearching;

  const canEnrich =
    hasLiveLeads &&
    runStatus === "complete" &&
    leadList.length > 0 &&
    !isSearching &&
    !enrichComplete &&
    leadList.some((l) => l.enrichmentStatus !== "complete" && l.enrichmentStatus !== "loading");

  const enrichInProgress =
    isEnriching || leadList.some((l) => l.enrichmentStatus === "loading");

  const enrichDoneCount = leadList.filter(
    (l) => l.enrichmentStatus === "complete" || l.enrichmentStatus === "error",
  ).length;

  const showEnrichPopup =
    !enrichComplete && (canEnrich || enrichInProgress) && !enrichPopupDismissed;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isSearching && (
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-800 bg-stone-900/40 px-4 py-2.5 text-xs text-stone-400">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-800 border-t-stone-300" />
          Querying Fiber for live matches…
          {leadList.length > 0 ? (
            <span className="ml-auto font-mono">{leadList.length} found</span>
          ) : null}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-auto bg-cream/40">
        {showEnrichPopup ? (
          <EnrichPopup
            leadCount={leadList.length}
            doneCount={enrichDoneCount}
            isEnriching={isEnriching}
            enrichInProgress={enrichInProgress}
            onEnrich={() => void onEnrichAll()}
            onDismiss={() => onEnrichPopupDismissedChange(true)}
          />
        ) : null}

        {hasLiveLeads && leadList.length > 0 && !showEnrichPopup ? (
          <div className="sticky top-0 z-10 border-b border-stone-800/80 bg-cream-deep/95 px-4 py-1.5 text-right backdrop-blur-sm">
            <span className="font-mono text-[11px] text-stone-400">
              {selectedIds.size}/{leadList.length} selected
            </span>
          </div>
        ) : null}

        {showMock || (hasSearched && isSearching && !hasLiveLeads) ? (
          <>
            {hasSearched && isSearching && !hasLiveLeads ? (
              <div className="absolute inset-x-0 top-0 z-10 border-b border-brand-blue/20 bg-brand-blue/5 px-4 py-2 text-center text-xs text-brand-blue-light">
                Replacing preview with live Fiber results…
              </div>
            ) : null}
            <SpreadsheetTable mode="mock" isPreview={!hasSearched} />
          </>
        ) : showEmpty ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-stone-400">
            No matches — try broadening your ICP in chat.
          </div>
        ) : (
          <SpreadsheetTable
            mode="live"
            liveRows={leadList}
            selectedIds={selectedIds}
            onToggleLead={onToggleLead}
            onToggleAll={onToggleAll}
            selectionEnabled={hasLiveLeads && runStatus === "complete"}
          />
        )}
      </div>
    </div>
  );
}
