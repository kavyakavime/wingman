"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_ICP } from "@/lib/mockLeads";
import type { IcpAttachmentPayload } from "@/lib/icpAttachment";
import {
  countReactionsByRound,
  deriveGraphPersonas,
} from "@/lib/swarmGraphData";
import { ChatWorkflow } from "./workspace/ChatWorkflow";
import { LeadsPanel, type LeftPanelTab } from "./workspace/LeadsPanel";

export function WingmanWorkspace() {
  const [icp, setIcp] = useState(DEFAULT_ICP);
  const [activeRunId, setActiveRunId] = useState<Id<"audienceRuns"> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"leads">>>(new Set());
  const [leftTab, setLeftTab] = useState<LeftPanelTab>("leads");
  const [isSwarmActive, setIsSwarmActive] = useState(false);

  const prepareSearch = useMutation(api.leads.startSearch);
  const fetchAudience = useAction(api.fiberActions.fetchAudience);
  const enrichLeads = useAction(api.enrichActions.enrichLeads);
  const allReactions = useQuery(api.agentReactions.listSwarmReactions);

  const run = useQuery(
    api.leads.getRun,
    activeRunId ? { runId: activeRunId } : "skip",
  );
  const leads = useQuery(
    api.leads.listByRun,
    activeRunId ? { runId: activeRunId } : "skip",
  );

  const isRunLoading =
    isSearching || (run !== undefined && run !== null && run.status === "loading");

  const leadList = useMemo(() => leads ?? [], [leads]);
  const hasSearched = activeRunId !== null;
  const hasLiveLeads = leadList.length > 0;

  useEffect(() => {
    if (!leads || leads.length === 0) {
      setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    setSelectedIds((prev) => {
      const valid = new Set(leads.map((l) => l._id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [leads]);

  const selectedLeadIds = useMemo(
    () => leadList.filter((l) => selectedIds.has(l._id)).map((l) => l._id),
    [leadList, selectedIds],
  );

  const unselectedLeads = useMemo(
    () =>
      leadList
        .filter((l) => !selectedIds.has(l._id))
        .map((l) => ({
          _id: l._id,
          personName: l.personName ?? undefined,
        })),
    [leadList, selectedIds],
  );

  const selectedIdSet = useMemo(() => new Set(selectedLeadIds), [selectedLeadIds]);

  const swarmReactions = useMemo(() => {
    if (!allReactions || selectedLeadIds.length === 0) return [];
    return allReactions.filter((r) => selectedIdSet.has(r.leadId));
  }, [allReactions, selectedLeadIds, selectedIdSet]);

  const graphPersonas = useMemo(() => {
    const leadById = new Map(leadList.map((l) => [l._id, l]));
    const base = selectedLeadIds.map((id) => {
      const lead = leadById.get(id);
      const reaction = swarmReactions.find((r) => r.leadId === id);
      return {
        _id: id,
        personName: lead?.personName ?? reaction?.personName ?? "Lead",
        segment: reaction?.segment,
      };
    });
    return deriveGraphPersonas(base, swarmReactions);
  }, [selectedLeadIds, leadList, swarmReactions]);

  const personaCount = selectedLeadIds.length || graphPersonas.length;
  const { round1, round2 } = useMemo(
    () => countReactionsByRound(swarmReactions, personaCount),
    [swarmReactions, personaCount],
  );

  const enrichComplete = useMemo(
    () =>
      leadList.length > 0 &&
      leadList.every(
        (l) => l.enrichmentStatus === "complete" || l.enrichmentStatus === "error",
      ),
    [leadList],
  );

  const handleSearch = useCallback(
    async (trimmedIcp: string, attachment?: IcpAttachmentPayload | null) => {
      setSearchError(null);
      setIsSearching(true);
      setSelectedIds(new Set());
      if (trimmedIcp) setIcp(trimmedIcp);

      const seedIcp =
        trimmedIcp ||
        (attachment ? `Attachment: ${attachment.fileName}` : "");

      try {
        const runId = await prepareSearch({ icp: seedIcp });
        setActiveRunId(runId);
        await fetchAudience({
          runId,
          icp: trimmedIcp,
          attachment: attachment ?? undefined,
        });
      } catch (error) {
        setSearchError(
          error instanceof Error ? error.message : "Search failed unexpectedly.",
        );
      } finally {
        setIsSearching(false);
      }
    },
    [prepareSearch, fetchAudience],
  );

  const handleToggleLead = useCallback((id: Id<"leads">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(leadList.map((l) => l._id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [leadList],
  );

  const handleEnrichAll = useCallback(async () => {
    if (leadList.length === 0) return;
    setIsEnriching(true);
    setSearchError(null);
    try {
      await enrichLeads({ leadIds: leadList.map((l) => l._id) });
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Enrichment failed unexpectedly.",
      );
    } finally {
      setIsEnriching(false);
    }
  }, [leadList, enrichLeads]);

  const selectedLeads = useMemo(
    () => leadList.filter((l) => selectedIds.has(l._id)),
    [leadList, selectedIds],
  );

  const goToSwarm = useCallback(() => setLeftTab("swarm"), []);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
      <LeadsPanel
        leftTab={leftTab}
        onLeftTabChange={setLeftTab}
        isSwarmActive={isSwarmActive}
        swarmRound1={round1}
        swarmRound2={round2}
        swarmPersonaCount={personaCount}
        graphPersonas={graphPersonas}
        swarmReactions={swarmReactions}
        unselectedLeads={unselectedLeads}
        selectedLeadIds={selectedLeadIds}
        hasLiveLeads={hasLiveLeads}
        hasSearched={hasSearched}
        isSearching={isRunLoading}
        runStatus={run?.status ?? null}
        leads={leads}
        selectedIds={selectedIds}
        onToggleLead={handleToggleLead}
        onToggleAll={handleToggleAll}
        onEnrichAll={handleEnrichAll}
        isEnriching={isEnriching}
      />
      <ChatWorkflow
        icp={icp}
        onIcpChange={setIcp}
        onFindAudience={handleSearch}
        isSearching={isRunLoading}
        searchError={searchError}
        runStatus={run?.status ?? null}
        hasLiveLeads={hasLiveLeads}
        selectedLeadIds={selectedLeadIds}
        selectedLeads={selectedLeads}
        enrichComplete={enrichComplete}
        leadCount={leadList.length}
        onGoToSwarm={goToSwarm}
        onSwarmActiveChange={setIsSwarmActive}
      />
    </div>
  );
}
