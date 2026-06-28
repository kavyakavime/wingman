"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { AmbientLeadRow, GraphPersonaRow, SwarmReactionRow } from "@/lib/swarmGraphData";
import { SwarmGraph } from "../SwarmGraph";
import { RewriteSpreadsheet } from "./RewriteSpreadsheet";
import { LeadSpreadsheet, type LeadRow } from "./LeadSpreadsheet";
import type { PersonaSegment } from "@/lib/segments";

export type LeftPanelTab = "leads" | "swarm" | "rewrites";

type LeadsPanelProps = {
  leftTab: LeftPanelTab;
  onLeftTabChange: (tab: LeftPanelTab) => void;
  isSwarmActive: boolean;
  swarmRound1: number;
  swarmRound2: number;
  swarmPersonaCount: number;
  graphPersonas: GraphPersonaRow[];
  swarmReactions: SwarmReactionRow[];
  unselectedLeads: AmbientLeadRow[];
  selectedLeadIds: Id<"leads">[];
  hasLiveLeads: boolean;
  hasSearched: boolean;
  isSearching: boolean;
  runStatus: "loading" | "complete" | "empty" | "error" | null;
  searchError?: string | null;
  leads: LeadRow[] | undefined;
  selectedIds: Set<Id<"leads">>;
  onToggleLead: (id: Id<"leads">) => void;
  onToggleAll: (checked: boolean) => void;
  onEnrichAll: () => Promise<void>;
  isEnriching: boolean;
  enrichComplete: boolean;
  enrichPopupDismissed: boolean;
  onEnrichPopupDismissedChange: (dismissed: boolean) => void;
  hasRewrites: boolean;
  rewriteBySegment: Map<PersonaSegment, string>;
  generatedViaBySegment: Map<PersonaSegment, "cursor_sdk" | "openai_fallback">;
  simulationDraft: string;
  rewriteSelectedIds: Set<Id<"leads">>;
  onToggleRewriteLead: (id: Id<"leads">) => void;
  onToggleAllRewriteLeads: (checked: boolean) => void;
  onOpenRewriteSend: (leadId: Id<"leads">) => void;
};

export function LeadsPanel({
  leftTab,
  onLeftTabChange,
  isSwarmActive,
  swarmRound1,
  swarmRound2,
  swarmPersonaCount,
  graphPersonas,
  swarmReactions,
  unselectedLeads,
  selectedLeadIds,
  hasRewrites,
  rewriteBySegment,
  generatedViaBySegment,
  simulationDraft,
  rewriteSelectedIds,
  onToggleRewriteLead,
  onToggleAllRewriteLeads,
  onOpenRewriteSend,
  ...spreadsheetProps
}: LeadsPanelProps) {
  const rewriteLeads = (spreadsheetProps.leads ?? []).filter((lead) =>
    selectedLeadIds.includes(lead._id),
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-stone-800 bg-cream-deep">
      <div className="flex shrink-0 items-center border-b border-stone-800 bg-cream-deep px-4">
        <button
          type="button"
          onClick={() => onLeftTabChange("leads")}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
            leftTab === "leads"
              ? "border-brand-blue text-brand-blue-light"
              : "border-transparent text-stone-500 hover:text-stone-200"
          }`}
        >
          Leads
        </button>
        <button
          type="button"
          onClick={() => onLeftTabChange("swarm")}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
            leftTab === "swarm"
              ? "border-brand-blue text-brand-blue-light"
              : "border-transparent text-stone-500 hover:text-stone-200"
          }`}
        >
          Swarm
          {isSwarmActive && (
            <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-blue" />
          )}
        </button>
        <button
          type="button"
          disabled={!hasRewrites}
          onClick={() => hasRewrites && onLeftTabChange("rewrites")}
          title={
            hasRewrites
              ? "Segment rewrites from Cursor SDK"
              : "Run Fix it in chat after swarm scores to unlock"
          }
          className={`border-b-2 px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
            leftTab === "rewrites"
              ? "border-brand-blue text-brand-blue-light"
              : "border-transparent text-stone-500 hover:text-stone-200"
          }`}
        >
          Rewritten emails
        </button>
        {leftTab === "swarm" && (swarmRound1 > 0 || swarmRound2 > 0) && (
          <span className="ml-auto font-mono text-xs text-stone-400">
            R1 {swarmRound1}/{swarmPersonaCount} · R2 {swarmRound2}/{swarmPersonaCount}
          </span>
        )}
      </div>

      {leftTab === "leads" ? (
        <LeadSpreadsheet {...spreadsheetProps} />
      ) : leftTab === "rewrites" ? (
        <RewriteSpreadsheet
          leads={rewriteLeads}
          rewriteBySegment={rewriteBySegment}
          generatedViaBySegment={generatedViaBySegment}
          simulationDraft={simulationDraft}
          selectedIds={rewriteSelectedIds}
          onToggleLead={onToggleRewriteLead}
          onToggleAll={onToggleAllRewriteLeads}
          onOpenSend={onOpenRewriteSend}
        />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#040408]">
          <SwarmGraph
            personas={selectedLeadIds.length > 0 ? graphPersonas : []}
            reactions={swarmReactions}
            isSwarmRunning={isSwarmActive}
            draftMessage={simulationDraft}
            ambientLeads={unselectedLeads}
            fillContainer
            emptyMessage={
              selectedLeadIds.length === 0
                ? "Select leads in the spreadsheet to simulate."
                : "Paste a draft in chat and send to start the simulation."
            }
          />
        </div>
      )}
    </div>
  );
}
