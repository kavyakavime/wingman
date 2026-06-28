"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { AmbientLeadRow, GraphPersonaRow, SwarmReactionRow } from "@/lib/swarmGraphData";
import { SwarmGraph } from "../SwarmGraph";
import { LeadSpreadsheet, type LeadRow } from "./LeadSpreadsheet";

export type LeftPanelTab = "leads" | "swarm";

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
  leads: LeadRow[] | undefined;
  selectedIds: Set<Id<"leads">>;
  onToggleLead: (id: Id<"leads">) => void;
  onToggleAll: (checked: boolean) => void;
  onEnrichAll: () => Promise<void>;
  isEnriching: boolean;
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
  ...spreadsheetProps
}: LeadsPanelProps) {
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
        {leftTab === "swarm" && (swarmRound1 > 0 || swarmRound2 > 0) && (
          <span className="ml-auto font-mono text-xs text-stone-400">
            R1 {swarmRound1}/{swarmPersonaCount} · R2 {swarmRound2}/{swarmPersonaCount}
          </span>
        )}
      </div>

      {leftTab === "leads" ? (
        <LeadSpreadsheet {...spreadsheetProps} />
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#040408]">
          <SwarmGraph
            personas={selectedLeadIds.length > 0 ? graphPersonas : []}
            reactions={swarmReactions}
            isSwarmRunning={isSwarmActive}
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
