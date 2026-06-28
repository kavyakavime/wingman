"use client";

import { useAction, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import {
  countReactionsByRound,
  deriveGraphPersonas,
} from "../lib/swarmGraphData";
import { DEFAULT_SWARM_DRAFT } from "../lib/swarmDraft";
import { SwarmGraph } from "./SwarmGraph";

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
    <section className="w-full space-y-4">
      <div className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Swarm test (hour 6)
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Run the reasoning engine against all locked personas. Round 1 is each
          agent&apos;s solo take; optionally run round 2 for peer influence within
          segments. Toggle rounds on the graph after a run.
        </p>
      </div>

      <textarea
        value={draftMessage}
        onChange={(e) => setDraftMessage(e.target.value)}
        rows={12}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 font-mono text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        placeholder="Paste your draft cold email…"
      />

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <input
          type="checkbox"
          checked={includeRound2}
          onChange={(e) => setIncludeRound2(e.target.checked)}
          disabled={isRunning}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Include round 2 (peer influence)
          </span>
          <span className="mt-0.5 block text-zinc-500">
            Agents re-evaluate after seeing how others in their segment reacted.
            Uncheck to stop after round 1 solo reactions.
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={handleRunSwarm}
        disabled={isRunning || !draftMessage.trim()}
        className="w-full rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {isRunning ? "Running swarm…" : "Run swarm"}
      </button>

      {clientError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {clientError}
        </p>
      )}

      {isStreaming && (
        <p className="text-sm text-zinc-500">
          Agents thinking… round 1: {round1}/{personaCount}
          {includeRound2 ? ` · round 2: ${round2}/${personaCount}` : ""} · total{" "}
          {reactions?.length ?? 0}/{totalExpected}
        </p>
      )}

      <SwarmGraph
        personas={lockedPersonas === undefined ? undefined : graphPersonas}
        reactions={reactions}
        isSwarmRunning={isStreaming}
        emptyMessage="No locked personas found. Seed demo data first."
      />
    </section>
  );
}
