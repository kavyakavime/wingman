"use client";

import { useAction, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import {
  countReactionsByRound,
  deriveGraphPersonas,
} from "../lib/swarmGraphData";
import { DEFAULT_SWARM_DRAFT } from "../lib/swarmDraft";
import { ScoreCard } from "./ScoreCard";
import { SegmentRewritesPanel } from "./SegmentRewritesPanel";
import { SendWinningVariantsPanel } from "./SendWinningVariantsPanel";
import { SwarmGraph } from "./SwarmGraph";
import { Button } from "./ui/Button";
import { Panel, PanelBody, PanelDivider } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

export function SwarmTestPanel() {
  const [draftMessage, setDraftMessage] = useState(DEFAULT_SWARM_DRAFT);
  const [includeRound2, setIncludeRound2] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [expectedCount, setExpectedCount] = useState(0);

  const reactions = useQuery(api.agentReactions.listSwarmReactions);
  const lockedPersonas = useQuery(api.leads.listLockedPersonas);
  const runSwarm = useAction(api.swarmActions.runSwarm);

  const graphPersonas = useMemo(
    () => deriveGraphPersonas(lockedPersonas ?? [], reactions ?? []),
    [lockedPersonas, reactions],
  );

  const personaCount = graphPersonas.length || lockedPersonas?.length || 6;
  const totalExpected = personaCount * (includeRound2 ? 2 : 1);

  const { round1, round2 } = useMemo(
    () => countReactionsByRound(reactions, personaCount),
    [reactions, personaCount],
  );

  const isStreaming =
    isRunning ||
    (expectedCount > 0 && (reactions?.length ?? 0) < expectedCount);

  async function handleRunSwarm() {
    setClientError(null);
    setIsRunning(true);
    const count = graphPersonas.length || lockedPersonas?.length || 6;
    setExpectedCount(count * (includeRound2 ? 2 : 1));
    try {
      await runSwarm({
        draftMessage: draftMessage.trim(),
        includeRound2,
      });
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Swarm run failed unexpectedly.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Panel id="swarm">
      <PanelBody className="space-y-8">
        <SectionHeader
          step={3}
          title="Run the swarm"
          description="Fire your draft at every persona. See how each segment reacts — solo first, then with peer influence."
        />

        <div className="space-y-4">
          <label className="block text-sm font-medium text-stone-300">
            Outbound draft
          </label>
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            rows={10}
            className="w-full rounded-xl border border-stone-800 bg-cream px-4 py-3.5 font-mono text-[13px] leading-relaxed text-stone-200 shadow-inner shadow-black/20 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            placeholder="Paste your cold email draft…"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-800 bg-cream/60 px-4 py-3.5">
          <input
            type="checkbox"
            checked={includeRound2}
            onChange={(e) => setIncludeRound2(e.target.checked)}
            disabled={isRunning}
            className="mt-0.5 h-4 w-4 rounded border-stone-700"
          />
          <span className="text-sm">
            <span className="font-medium text-stone-100">
              Include peer influence (round 2)
            </span>
            <span className="mt-0.5 block text-stone-500">
              Agents re-evaluate after seeing how others in their segment reacted.
            </span>
          </span>
        </label>

        <Button
          type="button"
          fullWidth
          onClick={handleRunSwarm}
          disabled={isRunning || !draftMessage.trim()}
        >
          {isRunning ? "Running swarm…" : "Run swarm test"}
        </Button>

        {clientError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {clientError}
          </p>
        )}

        {isStreaming && (
          <div className="flex items-center gap-3 rounded-xl bg-brand-blue/10 px-4 py-3 text-sm text-brand-blue-light">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-blue/20 border-t-brand-blue" />
            Round 1: {round1}/{personaCount}
            {includeRound2 ? ` · Round 2: ${round2}/${personaCount}` : ""}
          </div>
        )}

        <SwarmGraph
          personas={lockedPersonas === undefined ? undefined : graphPersonas}
          reactions={reactions}
          isSwarmRunning={isStreaming}
          emptyMessage="Enrich personas above, then run the swarm."
        />
      </PanelBody>

      <PanelDivider />

      <PanelBody>
        <ScoreCard />
      </PanelBody>

      <PanelDivider />

      <PanelBody>
        <SegmentRewritesPanel originalDraft={draftMessage} />
      </PanelBody>

      <PanelDivider />

      <PanelBody>
        <SendWinningVariantsPanel />
      </PanelBody>
    </Panel>
  );
}
