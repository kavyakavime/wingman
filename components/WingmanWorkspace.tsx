"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_ICP } from "@/lib/mockLeads";
import {
  nextCachedLeadList,
  resolveStableLeadList,
} from "@/lib/stableLeadList";
import type { IcpAttachmentPayload } from "@/lib/icpAttachment";
import type { PersonaSegment } from "@/lib/segments";
import type { OutreachChannel } from "@/lib/outreachChannel";
import {
  countReactionsByRound,
  deriveGraphPersonas,
} from "@/lib/swarmGraphData";
import {
  defaultWorkspaceHydration,
  hydrateWorkspace,
  patchWorkspaceSession,
} from "@/lib/workspaceSession";
import { ChatWorkflow } from "./workspace/ChatWorkflow";
import { LeadsPanel, type LeftPanelTab } from "./workspace/LeadsPanel";
import type { LeadRow } from "./workspace/LeadSpreadsheet";
import { WingmanLogo } from "./WingmanLogo";
import { Button } from "./ui/Button";
import { SendLeadsModal } from "./SendLeadsModal";

export function WingmanWorkspace() {
  const defaults = useMemo(() => defaultWorkspaceHydration(), []);

  const [icp, setIcp] = useState(defaults.icp);
  const [activeRunId, setActiveRunId] = useState<Id<"audienceRuns"> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"leads">>>(
    () => new Set(),
  );
  const [leftTab, setLeftTab] = useState<LeftPanelTab>("leads");
  const [isSwarmActive, setIsSwarmActive] = useState(false);
  const [showSendLeadsModal, setShowSendLeadsModal] = useState(false);
  const [sendModalLeadsOverride, setSendModalLeadsOverride] = useState<LeadRow[] | null>(
    null,
  );
  const [simulationDraft, setSimulationDraft] = useState("");
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel | null>(null);
  const [enrichPopupDismissed, setEnrichPopupDismissed] = useState(false);
  const [rewriteSelectedIds, setRewriteSelectedIds] = useState<Set<Id<"leads">>>(
    () => new Set(),
  );
  const [cachedLeads, setCachedLeads] = useState<LeadRow[]>([]);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const session = hydrateWorkspace();
    setIcp(session.icp || DEFAULT_ICP);
    setActiveRunId(session.activeRunId);
    setSelectedIds(new Set(session.selectedLeadIds));
    setLeftTab(session.leftTab);
    setSimulationDraft(session.simulationDraft);
    setOutreachChannel(session.chat.channel);
    setEnrichPopupDismissed(session.enrichPopupDismissed);
    setSessionReady(true);
  }, []);

  const prepareSearch = useMutation(api.leads.startSearch);
  const fetchAudience = useAction(api.fiberActions.fetchAudience);
  const enrichLeads = useAction(api.enrichActions.enrichLeads);
  const clearStuckEnrichment = useMutation(api.leads.clearStuckEnrichment);
  const allReactions = useQuery(api.agentReactions.listSwarmReactions);
  const segmentRewrites = useQuery(api.segmentRewrites.listSegmentRewrites);

  const run = useQuery(
    api.leads.getRun,
    activeRunId ? { runId: activeRunId } : "skip",
  );
  const leads = useQuery(
    api.leads.listByRun,
    activeRunId ? { runId: activeRunId } : "skip",
  );

  const runStatus = run?.status ?? null;

  useEffect(() => {
    setCachedLeads((prev) => nextCachedLeadList(leads, runStatus, prev));
  }, [leads, runStatus]);

  useEffect(() => {
    if (activeRunId === null) setCachedLeads([]);
  }, [activeRunId]);

  const leadList = useMemo(
    () => resolveStableLeadList(leads, cachedLeads, runStatus),
    [leads, cachedLeads, runStatus],
  );

  const isRunLoading =
    leadList.length === 0 &&
    (isSearching || (run !== undefined && run !== null && run.status === "loading"));
  const hasSearched = activeRunId !== null;
  const hasLiveLeads = leadList.length > 0;

  const enrichComplete = useMemo(
    () =>
      leadList.length > 0 &&
      leadList.every(
        (l) => l.enrichmentStatus === "complete" || l.enrichmentStatus === "error",
      ),
    [leadList],
  );

  const hasRewrites = (segmentRewrites?.length ?? 0) > 0;

  const rewriteBySegment = useMemo(() => {
    return new Map(
      (segmentRewrites ?? []).map((row) => [
        row.segment as PersonaSegment,
        row.rewrittenDraft,
      ]),
    );
  }, [segmentRewrites]);

  const generatedViaBySegment = useMemo(() => {
    return new Map(
      (segmentRewrites ?? []).map((row) => [
        row.segment as PersonaSegment,
        row.generatedVia,
      ]),
    );
  }, [segmentRewrites]);

  useEffect(() => {
    if (leads === undefined) return;
    if (leads.length === 0) {
      if (runStatus === "empty" || runStatus === "error") {
        setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
      }
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
  }, [leads, runStatus]);

  useEffect(() => {
    if (leftTab === "rewrites" && !hasRewrites) {
      setLeftTab("swarm");
    }
  }, [leftTab, hasRewrites]);

  useEffect(() => {
    if (isEnriching || leads === undefined) return;
    const stuckIds = leadList
      .filter((l) => l.enrichmentStatus === "loading")
      .map((l) => l._id);
    if (stuckIds.length > 0) {
      void clearStuckEnrichment({ leadIds: stuckIds });
    }
  }, [clearStuckEnrichment, isEnriching, leadList, leads]);

  useEffect(() => {
    if (!enrichComplete) return;
    setEnrichPopupDismissed(true);
  }, [enrichComplete]);

  useEffect(() => {
    if (!sessionReady) return;
    patchWorkspaceSession({
      activeRunId,
      icp,
      selectedLeadIds: [...selectedIds],
      leftTab,
      simulationDraft,
      enrichPopupDismissed,
    });
  }, [
    sessionReady,
    activeRunId,
    icp,
    selectedIds,
    leftTab,
    simulationDraft,
    enrichPopupDismissed,
  ]);

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

  const handleSearch = useCallback(
    async (trimmedIcp: string, attachment?: IcpAttachmentPayload | null) => {
      setSearchError(null);
      setIsSearching(true);
      setSelectedIds(new Set());
      setEnrichPopupDismissed(false);
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

  const handleEnrichSelected = useCallback(async () => {
    const toEnrich = leadList.filter(
      (l) =>
        selectedIds.has(l._id) &&
        l.enrichmentStatus !== "complete" &&
        l.enrichmentStatus !== "loading",
    );
    if (toEnrich.length === 0) return;
    setIsEnriching(true);
    setSearchError(null);
    try {
      await enrichLeads({ leadIds: toEnrich.map((l) => l._id) });
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Enrichment failed unexpectedly.",
      );
    } finally {
      setIsEnriching(false);
    }
  }, [leadList, selectedIds, enrichLeads]);

  const selectedLeads = useMemo(
    () => leadList.filter((l) => selectedIds.has(l._id)),
    [leadList, selectedIds],
  );

  const rewriteSelectedLeads = useMemo(
    () => leadList.filter((l) => rewriteSelectedIds.has(l._id)),
    [leadList, rewriteSelectedIds],
  );

  const sendModalLeads =
    sendModalLeadsOverride ??
    (leftTab === "rewrites" ? rewriteSelectedLeads : selectedLeads);

  const handleOpenRewriteSend = useCallback(
    (leadId: Id<"leads">) => {
      const lead = leadList.find((l) => l._id === leadId);
      if (!lead) return;
      setSendModalLeadsOverride([lead]);
      setShowSendLeadsModal(true);
    },
    [leadList],
  );

  const openHeaderSendModal = useCallback(() => {
    setSendModalLeadsOverride(null);
    setShowSendLeadsModal(true);
  }, []);

  const sendDisabled =
    leftTab === "rewrites"
      ? !hasRewrites || rewriteSelectedIds.size === 0
      : selectedLeadIds.length === 0;

  useEffect(() => {
    if (!hasRewrites) {
      setRewriteSelectedIds(new Set());
      return;
    }
    setRewriteSelectedIds((prev) => {
      const pool = leadList.filter((l) => selectedIds.has(l._id));
      const valid = new Set(pool.map((l) => l._id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === 0 && pool.length > 0) {
        return new Set(pool.map((l) => l._id));
      }
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [hasRewrites, leadList, selectedIds]);

  const handleToggleRewriteLead = useCallback((id: Id<"leads">) => {
    setRewriteSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAllRewriteLeads = useCallback(
    (checked: boolean) => {
      const pool = leadList.filter((l) => selectedIds.has(l._id));
      if (checked) {
        setRewriteSelectedIds(new Set(pool.map((l) => l._id)));
      } else {
        setRewriteSelectedIds(new Set());
      }
    },
    [leadList, selectedIds],
  );

  const goToSwarm = useCallback(() => setLeftTab("swarm"), []);
  const goToRewrites = useCallback(() => setLeftTab("rewrites"), []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cream">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-stone-800/80 bg-cream-deep/95 px-5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <WingmanLogo size={26} />
          <span className="font-display shrink-0 text-[17px] font-bold leading-none text-stone-100">
            Wingman
          </span>
          <span className="hidden h-4 w-px shrink-0 bg-stone-700 sm:block" aria-hidden />
          <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
            <p className="min-w-0 truncate text-sm font-normal leading-snug tracking-wide text-stone-400">
              Test your GTM on digital twins. Only ship what wins.
            </p>
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
              title="Live simulation"
              aria-label="Live simulation"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={sendDisabled}
          onClick={openHeaderSendModal}
          className="shrink-0"
        >
          One-click send
        </Button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
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
        searchError={run?.errorMessage ?? searchError}
        leads={leadList}
        selectedIds={selectedIds}
        onToggleLead={handleToggleLead}
        onToggleAll={handleToggleAll}
        onEnrichAll={handleEnrichAll}
        isEnriching={isEnriching}
        enrichComplete={enrichComplete}
        enrichPopupDismissed={enrichPopupDismissed}
        onEnrichPopupDismissedChange={setEnrichPopupDismissed}
        hasRewrites={hasRewrites}
        rewriteBySegment={rewriteBySegment}
        generatedViaBySegment={generatedViaBySegment}
        simulationDraft={simulationDraft}
        rewriteSelectedIds={rewriteSelectedIds}
        onToggleRewriteLead={handleToggleRewriteLead}
        onToggleAllRewriteLeads={handleToggleAllRewriteLeads}
        onOpenRewriteSend={handleOpenRewriteSend}
      />
      <ChatWorkflow
        sessionReady={sessionReady}
        activeRunId={activeRunId}
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
        isEnriching={isEnriching}
        onEnrichSelected={handleEnrichSelected}
        leadCount={leadList.length}
        orangeSliceSpreadsheetId={run?.orangeSliceSpreadsheetId}
        onGoToSwarm={goToSwarm}
        onGoToRewrites={goToRewrites}
        onSwarmActiveChange={setIsSwarmActive}
        onOpenSendModal={openHeaderSendModal}
        onSimulationDraftChange={setSimulationDraft}
        onOutreachChannelChange={setOutreachChannel}
      />
      </main>

      <SendLeadsModal
        open={showSendLeadsModal}
        onClose={() => {
          setShowSendLeadsModal(false);
          setSendModalLeadsOverride(null);
        }}
        leads={sendModalLeads}
        simulationDraft={simulationDraft}
        channel={outreachChannel}
      />
    </div>
  );
}
