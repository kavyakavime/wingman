"use client";

import { useAction, useQuery } from "convex/react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  computeOverallReplyRate,
  computeSegmentScores,
  type SegmentScore,
} from "@/lib/scoreCard";
import {
  pickDisplayReactions,
  pickReactionsForRound,
} from "@/lib/swarmGraphData";
import {
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  SEGMENT_STYLES,
} from "@/lib/segments";
import { Button } from "../ui/Button";
import type { LeadRow } from "./LeadSpreadsheet";
import { ChatModePicker, type ChatMode } from "./ChatModePicker";
import type { IcpAttachmentPayload } from "@/lib/icpAttachment";
import { readIcpAttachmentFile } from "@/lib/readIcpAttachment";
import { channelLabel, type OutreachChannel } from "@/lib/outreachChannel";
import {
  loadWorkspaceSession,
  patchWorkspaceSession,
  type StoredChatMessage,
} from "@/lib/workspaceSession";

type ChatMessage =
  | { id: string; role: "user" | "assistant"; kind: "text"; content: string }
  | { id: string; role: "assistant"; kind: "test_type_picker" }
  | { id: string; role: "assistant"; kind: "channel_picker" }
  | {
      id: string;
      role: "assistant";
      kind: "swarm_results";
      variant: "baseline" | "after_rewrite";
      label: string;
      summary: string;
      scores: SegmentScore[];
      overall: number | null;
      beforeScores?: SegmentScore[] | null;
    }
  | {
      id: string;
      role: "assistant";
      kind: "rewrite_ready";
    };

type ChatWorkflowProps = {
  sessionReady: boolean;
  activeRunId: Id<"audienceRuns"> | null;
  icp: string;
  onIcpChange: (value: string) => void;
  onFindAudience: (icp: string, attachment?: IcpAttachmentPayload | null) => Promise<void>;
  isSearching: boolean;
  searchError: string | null;
  runStatus: "loading" | "complete" | "empty" | "error" | null;
  hasLiveLeads: boolean;
  selectedLeadIds: Id<"leads">[];
  selectedLeads: LeadRow[];
  enrichComplete: boolean;
  isEnriching: boolean;
  onEnrichSelected: () => Promise<void>;
  leadCount: number;
  orangeSliceSpreadsheetId?: string | null;
  onGoToSwarm: () => void;
  onGoToRewrites: () => void;
  onSwarmActiveChange: (active: boolean) => void;
  onOpenSendModal: () => void;
  onSimulationDraftChange: (draft: string) => void;
  onOutreachChannelChange: (channel: OutreachChannel | null) => void;
};

function AttachIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      />
      <path
        d="M19 11v1a7 7 0 01-14 0v-1M12 18v3M8 21h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function CardDismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onDismiss();
      }}
      className="shrink-0 rounded-md p-1 text-stone-500 transition hover:bg-stone-800 hover:text-stone-300"
      aria-label="Dismiss"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M18 6L6 18M6 6l12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function SwarmResultsCard({
  label,
  summary,
  scores,
  overall,
  beforeScores,
  variant,
  onFixIt,
  onSend,
  onDismiss,
  isGenerating,
  isSwarmRunning,
  fixItUsed,
}: {
  label: string;
  summary: string;
  scores: SegmentScore[];
  overall: number | null;
  beforeScores?: SegmentScore[] | null;
  variant: "baseline" | "after_rewrite";
  onFixIt?: () => void;
  onSend?: () => void;
  onDismiss?: () => void;
  isGenerating?: boolean;
  isSwarmRunning?: boolean;
  fixItUsed?: boolean;
}) {
  return (
    <div className="w-full max-w-full space-y-3 rounded-xl border border-stone-800 bg-cream-deep p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-100">{label}</p>
          {overall !== null ? (
            <p className="mt-1 text-xs text-stone-500">
              Overall projected reply rate:{" "}
              <span className="font-semibold tabular-nums text-stone-200">{overall}%</span>
              <span className="ml-1 text-stone-400">(cold outbound baseline — not a promise)</span>
            </p>
          ) : null}
        </div>
        {onDismiss ? <CardDismissButton onDismiss={onDismiss} /> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {SEGMENT_ORDER.map((segment) => {
          const score = scores.find((s) => s.segment === segment);
          const styles = SEGMENT_STYLES[segment];
          const before = beforeScores?.find((b) => b.segment === segment);
          const delta =
            before?.predictedReplyRate != null && score?.predictedReplyRate != null
              ? Math.round((score.predictedReplyRate - before.predictedReplyRate) * 100) / 100
              : null;

          if (!score || score.personaCount === 0) {
            return (
              <div
                key={segment}
                className="rounded-lg border border-dashed border-stone-800 px-3 py-2.5 text-xs text-stone-400"
              >
                {SEGMENT_LABELS[segment]} — no personas in this segment
              </div>
            );
          }

          return (
            <div
              key={segment}
              className={`rounded-lg border px-3 py-2.5 ${styles.border} bg-cream/30`}
            >
              <p className={`text-xs font-semibold ${styles.header}`}>
                {SEGMENT_LABELS[segment]}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-100">
                {score.predictedReplyRate ?? "—"}%
              </p>
              {delta !== null && delta !== 0 ? (
                <p
                  className={`text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}% vs baseline
                </p>
              ) : null}
              {score.topSignals[0] ? (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-stone-400">
                  &ldquo;{score.topSignals[0]}&rdquo;
                </p>
              ) : null}
              <p className="mt-1 text-[10px] text-stone-400">n={score.personaCount}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-stone-500">{summary}</p>
      {variant === "baseline" && onFixIt ? (
        <Button
          type="button"
          onClick={onFixIt}
          disabled={isGenerating || isSwarmRunning || fixItUsed}
        >
          {isGenerating ? "Rewriting emails…" : "Fix it"}
        </Button>
      ) : null}
      {variant === "after_rewrite" && onSend ? (
        <Button type="button" onClick={onSend}>
          One-click send
        </Button>
      ) : null}
    </div>
  );
}

function RewriteReadyCard({
  onReswarm,
  onDismiss,
  isRetesting,
  rewriteCount,
}: {
  onReswarm: () => void;
  onDismiss?: () => void;
  isRetesting: boolean;
  rewriteCount: number;
}) {
  return (
    <div className="w-full max-w-full space-y-3 rounded-xl border border-stone-800 bg-cream-deep p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-100">Rewrites ready</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            {rewriteCount > 0
              ? `${rewriteCount} segment variant${rewriteCount === 1 ? "" : "s"} rewritten from swarm objections. Open the Rewritten emails tab to review, then re-swarm.`
              : "Segment variants are ready. Re-swarm to test them on your selected digital twins."}
          </p>
        </div>
        {onDismiss ? <CardDismissButton onDismiss={onDismiss} /> : null}
      </div>
      <Button type="button" onClick={onReswarm} disabled={isRetesting}>
        {isRetesting ? "Re-swarming…" : "Re-swarm"}
      </Button>
    </div>
  );
}

export function ChatWorkflow({
  sessionReady,
  activeRunId,
  icp,
  onIcpChange,
  onFindAudience,
  isSearching,
  searchError,
  runStatus,
  hasLiveLeads,
  selectedLeadIds,
  selectedLeads,
  enrichComplete,
  isEnriching,
  onEnrichSelected,
  leadCount,
  orangeSliceSpreadsheetId,
  onGoToSwarm,
  onGoToRewrites,
  onSwarmActiveChange,
  onOpenSendModal,
  onSimulationDraftChange,
  onOutreachChannelChange,
}: ChatWorkflowProps) {
  const runKey = activeRunId ?? null;
  const chatRestoredForRunRef = useRef<string | null>(null);
  const skipChatPersistRef = useRef(false);

  const [chatMode, setChatMode] = useState<ChatMode>("icp_lead_gen");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<IcpAttachmentPayload | null>(null);
  const [attachmentNote, setAttachmentNote] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [channel, setChannel] = useState<OutreachChannel | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [activeDraft, setActiveDraft] = useState("");
  const [isSwarmRunning, setIsSwarmRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRetesting, setIsRetesting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [expectedReactionCount, setExpectedReactionCount] = useState(0);
  const [awaitingBaselineScores, setAwaitingBaselineScores] = useState(false);
  const [awaitingRetestScores, setAwaitingRetestScores] = useState(false);
  const baselineResultsSentRef = useRef(false);
  const retestResultsSentRef = useRef(false);
  const [leadsLoadedSent, setLeadsLoadedSent] = useState(false);
  const [enrichCompleteSent, setEnrichCompleteSent] = useState(false);

  useEffect(() => {
    if (!sessionReady) return;

    const sessionKey = runKey ?? "__none__";
    if (chatRestoredForRunRef.current === sessionKey) return;

    const session = loadWorkspaceSession();
    const savedRunId = session.chat.runId ?? null;
    const currentRunId = runKey;

    if (session.activeRunId && currentRunId === null) return;

    if (String(savedRunId) !== String(currentRunId)) {
      chatRestoredForRunRef.current = sessionKey;
      setChatMode("icp_lead_gen");
      setMessages([]);
      setChannel(null);
      setDraftMessage("");
      setActiveDraft("");
      setLeadsLoadedSent(false);
      setEnrichCompleteSent(false);
      baselineResultsSentRef.current = false;
      retestResultsSentRef.current = false;
      return;
    }

    skipChatPersistRef.current = true;
    chatRestoredForRunRef.current = sessionKey;
    setChatMode(session.chat.chatMode);
    setMessages(session.chat.messages as ChatMessage[]);
    setChannel(session.chat.channel);
    setDraftMessage(session.chat.draftMessage);
    setActiveDraft(session.chat.activeDraft);
    setLeadsLoadedSent(session.chat.leadsLoadedSent);
    setEnrichCompleteSent(session.chat.enrichCompleteSent);
    baselineResultsSentRef.current = session.chat.baselineResultsSent;
    retestResultsSentRef.current = session.chat.retestResultsSent;
  }, [sessionReady, runKey]);

  const canEnrich = hasLiveLeads;
  const selectedLeadsEnriched =
    selectedLeads.length > 0 &&
    selectedLeads.every(
      (l) => l.enrichmentStatus === "complete" || l.enrichmentStatus === "error",
    );
  const selectedLeadsNeedEnrichment = selectedLeads.some(
    (l) => l.enrichmentStatus !== "complete" && l.enrichmentStatus !== "loading",
  );
  const selectedLeadsEnriching = selectedLeads.some(
    (l) => l.enrichmentStatus === "loading",
  );
  const canSimulate = selectedLeadsEnriched;

  const scrollRef = useRef<HTMLDivElement>(null);
  const runSwarm = useAction(api.swarmActions.runSwarm);
  const generateRewrites = useAction(api.rewriteActions.generateSegmentRewrites);
  const retestVariants = useAction(api.rewriteActions.retestRewrittenVariants);

  const allReactions = useQuery(api.agentReactions.listSwarmReactions);
  const rewrites = useQuery(api.segmentRewrites.listSegmentRewrites);

  const selectedIdSet = useMemo(() => new Set(selectedLeadIds), [selectedLeadIds]);

  const swarmReactions = useMemo(() => {
    if (!allReactions || selectedLeadIds.length === 0) return [];
    return allReactions.filter((r) => selectedIdSet.has(r.leadId));
  }, [allReactions, selectedLeadIds, selectedIdSet]);

  const displayReactions = useMemo(
    () => pickDisplayReactions(swarmReactions, 2),
    [swarmReactions],
  );

  const baselineScores = useMemo(
    () => computeSegmentScores(displayReactions),
    [displayReactions],
  );

  const isStreaming =
    isSwarmRunning ||
    isRetesting ||
    (expectedReactionCount > 0 && swarmReactions.length < expectedReactionCount);

  useEffect(() => {
    onSwarmActiveChange(isStreaming);
  }, [isStreaming, onSwarmActiveChange]);

  const fixItUsed = useMemo(() => {
    let lastBaselineIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.kind === "swarm_results" && msg.variant === "baseline") {
        lastBaselineIdx = i;
        break;
      }
    }
    if (lastBaselineIdx === -1) return false;
    return messages
      .slice(lastBaselineIdx + 1)
      .some((msg) => msg.kind === "rewrite_ready");
  }, [messages]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const dismissMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    onSimulationDraftChange(activeDraft.trim() || draftMessage.trim());
  }, [activeDraft, draftMessage, onSimulationDraftChange]);

  useEffect(() => {
    onOutreachChannelChange(channel);
  }, [channel, onOutreachChannelChange]);

  useEffect(() => {
    if (!sessionReady) return;
    if (skipChatPersistRef.current) {
      skipChatPersistRef.current = false;
      return;
    }
    if (chatRestoredForRunRef.current !== (runKey ?? "__none__")) return;
    patchWorkspaceSession({
      chat: {
        runId: runKey,
        messages: messages as StoredChatMessage[],
        chatMode,
        draftMessage,
        activeDraft,
        channel,
        leadsLoadedSent,
        enrichCompleteSent,
        baselineResultsSent: baselineResultsSentRef.current,
        retestResultsSent: retestResultsSentRef.current,
      },
    });
  }, [
    sessionReady,
    runKey,
    messages,
    chatMode,
    draftMessage,
    activeDraft,
    channel,
    leadsLoadedSent,
    enrichCompleteSent,
  ]);

  useEffect(() => {
    if (chatMode === "simulation" && !canSimulate) {
      setChatMode(canEnrich ? "enrichment" : "icp_lead_gen");
    }
  }, [chatMode, canSimulate, canEnrich]);

  useEffect(() => {
    if (!hasLiveLeads || leadsLoadedSent) return;
    setLeadsLoadedSent(true);
    setChatMode("enrichment");
    appendMessage({
      id: uid(),
      role: "assistant",
      kind: "text",
      content: orangeSliceSpreadsheetId
        ? `${leadCount} leads loaded from Orange Slice. [Open spreadsheet in Orange Slice](https://www.orangeslice.ai/dashboard?spreadsheet=${orangeSliceSpreadsheetId}) — enrich here with Fiber live signals + Orange Slice pain signals.`
        : `${leadCount} leads loaded via Orange Slice. Enrich with Fiber + Orange Slice for live activity and pain signals.`,
    });
  }, [hasLiveLeads, leadsLoadedSent, leadCount, orangeSliceSpreadsheetId, appendMessage]);

  useEffect(() => {
    if (!selectedLeadsEnriched || enrichCompleteSent || selectedLeads.length === 0) return;
    setEnrichCompleteSent(true);
    appendMessage({
      id: uid(),
      role: "assistant",
      kind: "text",
      content:
        "Selected leads enriched. Switch to Simulation to test your draft on those digital twins.",
    });
  }, [selectedLeadsEnriched, enrichCompleteSent, selectedLeads.length, appendMessage]);

  useEffect(() => {
    if (!isSwarmRunning && !isRetesting && expectedReactionCount > 0) {
      if (swarmReactions.length >= expectedReactionCount) {
        setExpectedReactionCount(0);
      }
    }
  }, [isSwarmRunning, isRetesting, expectedReactionCount, swarmReactions.length]);

  useEffect(() => {
    if (!awaitingBaselineScores || isSwarmRunning || selectedLeadIds.length === 0) return;
    const round2 = pickReactionsForRound(swarmReactions, 2);
    if (round2.length < selectedLeadIds.length) return;
    if (baselineResultsSentRef.current) return;

    baselineResultsSentRef.current = true;
    setAwaitingBaselineScores(false);
    const scores = computeSegmentScores(round2);
    const overall = computeOverallReplyRate(round2);
    appendMessage({
      id: uid(),
      role: "assistant",
      kind: "swarm_results",
      variant: "baseline",
      label: "Swarm complete — segment scores",
      summary:
        "Honest baseline: sub-1% overall is normal for cold outbound. The point is knowing which segments object and why — before you burn real sends.",
      scores,
      overall,
    });
  }, [
    awaitingBaselineScores,
    isSwarmRunning,
    swarmReactions,
    selectedLeadIds.length,
    appendMessage,
  ]);

  useEffect(() => {
    if (!awaitingRetestScores || isRetesting || selectedLeadIds.length === 0) return;
    const round3 = pickReactionsForRound(swarmReactions, 3);
    if (round3.length < selectedLeadIds.length) return;
    if (retestResultsSentRef.current) return;

    retestResultsSentRef.current = true;
    setAwaitingRetestScores(false);
    const scores = computeSegmentScores(round3);
    const overall = computeOverallReplyRate(round3);
    appendMessage({
      id: uid(),
      role: "assistant",
      kind: "swarm_results",
      variant: "after_rewrite",
      label: "After rewrite — segment scores",
      summary: "Peer-influenced retest on the same selected twins — apples-to-apples vs the baseline swarm.",
      scores,
      overall,
      beforeScores: baselineScores,
    });
  }, [
    awaitingRetestScores,
    isRetesting,
    swarmReactions,
    selectedLeadIds.length,
    baselineScores,
    appendMessage,
  ]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    setClientError(null);

    if (chatMode === "icp_lead_gen") {
      const trimmed = icp.trim();
      if ((!trimmed && !attachment) || isSearching) return;

      const userLine = trimmed || `ICP document: ${attachment?.fileName ?? "attachment"}`;
      appendMessage({ id: uid(), role: "user", kind: "text", content: userLine });
      appendMessage({
        id: uid(),
        role: "assistant",
        kind: "text",
        content: attachment
          ? "Reading attachment and pulling live decision-makers…"
          : "Pulling live decision-makers…",
      });

      await onFindAudience(trimmed, attachment);
      setAttachment(null);
      setAttachmentNote(null);
      return;
    }

    if (chatMode === "simulation") {
      await handleRunSwarm();
      return;
    }

    if (chatMode === "enrichment") {
      if (selectedLeadIds.length === 0 || isEnriching || selectedLeadsEnriching) return;

      appendMessage({
        id: uid(),
        role: "user",
        kind: "text",
        content: `Enrich ${selectedLeadIds.length} selected lead${selectedLeadIds.length === 1 ? "" : "s"}`,
      });
      appendMessage({
        id: uid(),
        role: "assistant",
        kind: "text",
        content: "Pulling live signals for selected leads…",
      });

      await onEnrichSelected();
      return;
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAttachmentError(null);
    setAttachmentNote(`Reading ${file.name}…`);
    try {
      const payload = await readIcpAttachmentFile(file);
      setAttachment(payload);
      setAttachmentNote(file.name);
    } catch (error) {
      setAttachment(null);
      setAttachmentNote(null);
      setAttachmentError(
        error instanceof Error ? error.message : "Could not read attachment.",
      );
    }
  }

  function handleVoiceToggle() {
    setIsRecording((prev) => {
      const next = !prev;
      if (next) setAttachmentNote("Recording…");
      else setAttachmentNote(null);
      return next;
    });
  }

  async function handleRunSwarm() {
    const draft = draftMessage.trim();
    if (!draft || selectedLeadIds.length === 0 || !channel) return;

    setClientError(null);
    setActiveDraft(draft);
    setIsSwarmRunning(true);
    onGoToSwarm();
    baselineResultsSentRef.current = false;
    setExpectedReactionCount(selectedLeadIds.length * 2);

    appendMessage({
      id: uid(),
      role: "assistant",
      kind: "text",
      content: `Simulating ${selectedLeadIds.length} digital twin${selectedLeadIds.length === 1 ? "" : "s"} — watch the Swarm tab light up live.`,
    });
    appendMessage({
      id: uid(),
      role: "user",
      kind: "text",
      content: `${channelLabel(channel)} simulation · ${draft.slice(0, 120)}${draft.length > 120 ? "…" : ""}`,
    });

    try {
      await runSwarm({
        draftMessage: draft,
        leadIds: selectedLeadIds,
        includeRound2: true,
      });
      setAwaitingBaselineScores(true);
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Swarm run failed unexpectedly.",
      );
      setExpectedReactionCount(0);
    } finally {
      setIsSwarmRunning(false);
    }
  }

  async function handleFixIt() {
    const draft = activeDraft.trim() || draftMessage.trim();
    if (!draft) {
      setClientError("No simulation draft found. Paste your email and run the swarm first.");
      return;
    }
    if (!activeDraft.trim()) {
      setActiveDraft(draft);
    }
    setClientError(null);
    setIsGenerating(true);
    appendMessage({
      id: uid(),
      role: "user",
      kind: "text",
      content: "Fix it — rewrite per segment using swarm objections",
    });
    try {
      await generateRewrites({
        originalDraft: draft,
        leadIds: selectedLeadIds,
      });
      appendMessage({
        id: uid(),
        role: "assistant",
        kind: "rewrite_ready",
      });
      onGoToRewrites();
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Rewrite generation failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleReswarm() {
    setClientError(null);
    setIsRetesting(true);
    onGoToSwarm();
    retestResultsSentRef.current = false;
    appendMessage({
      id: uid(),
      role: "user",
      kind: "text",
      content: "Re-swarm with rewritten variants",
    });
    appendMessage({
      id: uid(),
      role: "assistant",
      kind: "text",
      content: `Re-simulating ${selectedLeadIds.length} digital twin${selectedLeadIds.length === 1 ? "" : "s"} with segment-specific rewritten emails…`,
    });
    try {
      await retestVariants({ leadIds: selectedLeadIds });
      setAwaitingRetestScores(true);
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Re-swarm failed.",
      );
      setExpectedReactionCount(0);
    } finally {
      setIsRetesting(false);
    }
  }

  const canSendIcp =
    chatMode === "icp_lead_gen" && (icp.trim().length > 0 || attachment !== null) && !isSearching;

  const canSendEnrichment =
    chatMode === "enrichment" &&
    canEnrich &&
    selectedLeadIds.length > 0 &&
    selectedLeadsNeedEnrichment &&
    !isEnriching &&
    !selectedLeadsEnriching;

  const canSendSimulation =
    chatMode === "simulation" &&
    selectedLeadsEnriched &&
    channel !== null &&
    draftMessage.trim().length > 0 &&
    !isSwarmRunning &&
    !isGenerating &&
    !isRetesting;

  const canSend = canSendIcp || canSendEnrichment || canSendSimulation;

  const sendLabel =
    isSearching
      ? "Sending…"
      : isEnriching || selectedLeadsEnriching
        ? "Enriching…"
        : isSwarmRunning
          ? "Simulating…"
          : chatMode === "enrichment"
            ? "Enrich"
            : "Send";

  const inputPlaceholder =
    chatMode === "simulation"
      ? channel === null
        ? "Pick a channel below, then paste your draft…"
        : channel === "email"
          ? "Paste your cold email draft…"
          : channel === "linkedin_dm"
            ? "Paste your LinkedIn DM…"
            : "Paste your physical mail copy…"
      : "Describe your ideal customer profile…";

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream/40">
      <div className="shrink-0 border-b border-stone-800 bg-cream-deep px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-100">Chat</h2>
        <p className="text-xs text-stone-500">
          {chatMode === "icp_lead_gen"
            ? "Type or attach an ICP, then send."
            : chatMode === "enrichment"
              ? "Select leads in the spreadsheet, then send to enrich them."
              : "Paste a draft and send to simulate."}
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm leading-relaxed text-stone-500">
            Start with ICP and lead generation — attach context or type your ideal customer
            profile, then send.
          </p>
        ) : null}
            {messages.map((msg) => {
              if (msg.kind === "text") {
                return (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`relative max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-brand-blue text-white"
                          : "border border-stone-800 bg-cream-deep pr-10 text-stone-200"
                      }`}
                    >
                      {msg.content}
                      {msg.role === "assistant" ? (
                        <button
                          type="button"
                          onClick={() => dismissMessage(msg.id)}
                          className="absolute right-2 top-2 rounded-md p-0.5 text-stone-500 transition hover:bg-stone-800 hover:text-stone-300"
                          aria-label="Dismiss message"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M18 6L6 18M6 6l12 12"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              }

              if (msg.kind === "test_type_picker") {
                return null;
              }

              if (msg.kind === "channel_picker") {
                return null;
              }

              if (msg.kind === "rewrite_ready") {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <RewriteReadyCard
                      onReswarm={handleReswarm}
                      onDismiss={() => dismissMessage(msg.id)}
                      isRetesting={isRetesting}
                      rewriteCount={rewrites?.length ?? 0}
                    />
                  </div>
                );
              }

              if (msg.kind === "swarm_results") {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <SwarmResultsCard
                      label={msg.label}
                      summary={msg.summary}
                      scores={msg.scores}
                      overall={msg.overall}
                      beforeScores={msg.beforeScores}
                      variant={msg.variant}
                      onFixIt={msg.variant === "baseline" ? handleFixIt : undefined}
                      onSend={onOpenSendModal}
                      onDismiss={() => dismissMessage(msg.id)}
                      isGenerating={isGenerating}
                      isSwarmRunning={isSwarmRunning}
                      fixItUsed={fixItUsed}
                    />
                  </div>
                );
              }

              return null;
            })}

            {clientError && (
              <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {clientError}
              </p>
            )}
            {searchError && (
              <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {searchError}
              </p>
            )}
          </div>

      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-stone-800 bg-cream-deep p-3"
      >
        <ChatModePicker
          mode={chatMode}
          onModeChange={setChatMode}
          canEnrich={canEnrich}
          canSimulate={canSimulate}
        />

        {chatMode === "enrichment" ? (
          <div className="mt-3 rounded-xl border border-stone-800 bg-cream/60 px-4 py-4 text-sm leading-relaxed text-stone-400">
            {!canEnrich ? (
              <p>Run ICP and lead generation first to load leads.</p>
            ) : selectedLeadIds.length === 0 ? (
              <p>
                Check one or more rows in the spreadsheet, then hit{" "}
                <span className="font-medium text-stone-200">Enrich</span> to pull live signals
                for those leads.
              </p>
            ) : selectedLeadsEnriched ? (
              <p>
                Selected leads are enriched. Switch to{" "}
                <span className="font-medium text-stone-200">Simulation</span> to test your draft.
              </p>
            ) : selectedLeadsEnriching || isEnriching ? (
              <p>
                Enriching {selectedLeadIds.length} selected lead
                {selectedLeadIds.length === 1 ? "" : "s"}…
              </p>
            ) : (
              <p>
                {selectedLeadIds.length} lead{selectedLeadIds.length === 1 ? "" : "s"} selected —
                hit <span className="font-medium text-stone-200">Enrich</span> to pull live
                signals.
              </p>
            )}
          </div>
        ) : (
          <>
            {chatMode === "simulation" ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["email", "Email"],
                    ["physical_mail", "Physical mail"],
                    ["linkedin_dm", "LinkedIn DM"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChannel(value)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                      channel === value
                        ? "border-brand-blue bg-brand-blue/15 text-brand-blue-light"
                        : "border-stone-800 bg-cream-deep text-stone-400 hover:border-stone-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {channel ? (
                  <button
                    type="button"
                    onClick={() => setChannel(null)}
                    className="rounded-lg border border-stone-800 px-2 py-1 text-[11px] text-stone-500 transition hover:border-stone-700 hover:text-stone-300"
                    aria-label="Clear channel selection"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ) : null}

            <textarea
              value={chatMode === "simulation" ? draftMessage : icp}
              onChange={(e) =>
                chatMode === "simulation"
                  ? setDraftMessage(e.target.value)
                  : onIcpChange(e.target.value)
              }
              rows={chatMode === "simulation" ? 6 : 4}
              placeholder={inputPlaceholder}
              disabled={chatMode === "simulation" && !canSimulate}
              className="mt-3 w-full resize-y rounded-xl border border-stone-800 bg-cream px-4 py-3 text-sm leading-relaxed text-stone-100 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:cursor-not-allowed disabled:opacity-50"
              style={
                chatMode === "simulation"
                  ? { minHeight: "120px", maxHeight: "320px", fontFamily: "ui-monospace, monospace", fontSize: "13px" }
                  : { minHeight: "96px", maxHeight: "200px" }
              }
            />
          </>
        )}

        <div className="mt-2 flex items-center gap-1">
          {chatMode === "icp_lead_gen" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach ICP document"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-800 hover:text-stone-200"
              >
                <AttachIcon />
              </button>
              <button
                type="button"
                onClick={handleVoiceToggle}
                title={isRecording ? "Stop recording" : "Record voice ICP"}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  isRecording
                    ? "bg-red-950/50 text-red-400"
                    : "text-stone-500 hover:bg-stone-800 hover:text-stone-200"
                }`}
              >
                <MicIcon active={isRecording} />
              </button>
              {attachmentNote ? (
                <span className="ml-1 truncate text-xs text-stone-400">{attachmentNote}</span>
              ) : null}
              {attachmentError ? (
                <span className="ml-1 truncate text-xs text-red-400">{attachmentError}</span>
              ) : null}
            </>
          ) : chatMode === "simulation" ? (
            <p className="text-xs text-stone-400">
              {selectedLeadIds.length} lead{selectedLeadIds.length === 1 ? "" : "s"} selected
              {channel ? ` · ${channelLabel(channel)}` : ""}
            </p>
          ) : chatMode === "enrichment" ? (
            <p className="text-xs text-stone-400">
              {selectedLeadIds.length} lead{selectedLeadIds.length === 1 ? "" : "s"} selected
              {selectedLeadsEnriched ? " · enriched" : selectedLeadsEnriching ? " · enriching…" : ""}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={!canSend}
            className="ml-auto"
          >
            {sendLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
