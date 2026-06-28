"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../convex/_generated/api";
import { computeSegmentScores } from "../lib/scoreCard";
import { pickDisplayReactions } from "../lib/swarmGraphData";
import {
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  SEGMENT_STYLES,
  type PersonaSegment,
} from "../lib/segments";
import { SectionHeader } from "./ui/SectionHeader";

function SegmentScoreCard({
  segment,
  predictedReplyRate,
  topSignals,
  personaCount,
}: {
  segment: PersonaSegment;
  predictedReplyRate: number | null;
  topSignals: string[];
  personaCount: number;
}) {
  const styles = SEGMENT_STYLES[segment];

  return (
    <article
      className={`rounded-xl border bg-cream/50 p-5 ${styles.border}`}
    >
      <h3 className={`text-sm font-semibold ${styles.header}`}>
        {SEGMENT_LABELS[segment]}
      </h3>

      {predictedReplyRate === null ? (
        <p className="mt-3 text-sm text-stone-500">Waiting for swarm reactions…</p>
      ) : (
        <>
          <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-stone-100">
            {predictedReplyRate}%
          </p>
          <p className="text-xs text-stone-500">
            Predicted reply rate (projected)
          </p>
          {personaCount > 0 ? (
            <p className="mt-1 text-xs text-stone-400">
              Avg across {personaCount} persona{personaCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </>
      )}

      {topSignals.length > 0 ? (
        <div className="mt-4 border-t border-stone-800 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Top signal{topSignals.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-2">
            {topSignals.map((signal) => (
              <li
                key={signal}
                className="text-sm leading-relaxed text-stone-300"
              >
                &ldquo;{signal}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      ) : predictedReplyRate !== null ? (
        <p className="mt-4 text-xs text-stone-500">No cited signal recorded.</p>
      ) : null}
    </article>
  );
}

export function ScoreCard() {
  const reactions = useQuery(api.agentReactions.listSwarmReactions);

  const displayReactions = useMemo(
    () => pickDisplayReactions(reactions ?? [], 2),
    [reactions],
  );

  const segmentScores = useMemo(
    () => computeSegmentScores(displayReactions),
    [displayReactions],
  );

  const scoresBySegment = useMemo(() => {
    const map = new Map(segmentScores.map((score) => [score.segment, score]));
    return SEGMENT_ORDER.map((segment) => map.get(segment)!);
  }, [segmentScores]);

  const hasAnyData = displayReactions.length > 0;

  return (
    <section className="w-full space-y-5">
      <SectionHeader
        title="Segment scores"
        description="Projected reply rates by segment. Updates live as agents react."
      />

      {!hasAnyData && reactions !== undefined ? (
        <p className="rounded-xl border border-dashed border-stone-800 bg-stone-900/40 px-4 py-6 text-center text-sm text-stone-500">
          Run the swarm to populate segment scores.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {scoresBySegment.map((score) => (
          <SegmentScoreCard
            key={score.segment}
            segment={score.segment}
            predictedReplyRate={score.predictedReplyRate}
            topSignals={score.topSignals}
            personaCount={score.personaCount}
          />
        ))}
      </div>
    </section>
  );
}
