"use client";

import { useAction, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import { computeSegmentScores } from "../lib/scoreCard";
import {
  pickDisplayReactions,
  pickReactionsForRound,
} from "../lib/swarmGraphData";
import {
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  SEGMENT_STYLES,
  type PersonaSegment,
} from "../lib/segments";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";

function EngineBadge({ generatedVia }: { generatedVia: "cursor_sdk" | "openai_fallback" }) {
  const isCursor = generatedVia === "cursor_sdk";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isCursor
          ? "bg-brand-blue/20 text-brand-blue-light"
          : "bg-orange-500/20 text-orange-300"
      }`}
    >
      {isCursor ? "Cursor SDK" : "OpenAI fallback"}
    </span>
  );
}

function BeforeAfterScore({
  segment,
  before,
  after,
}: {
  segment: PersonaSegment;
  before: number | null;
  after: number | null;
}) {
  const styles = SEGMENT_STYLES[segment];
  const delta =
    before !== null && after !== null ? after - before : null;

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${styles.border} bg-cream-deep`}
    >
      <p className={`text-xs font-semibold ${styles.header}`}>
        {SEGMENT_LABELS[segment]}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-stone-500">
          {before ?? "—"}%
        </span>
        <span className="text-stone-400">→</span>
        <span className="text-lg font-semibold tabular-nums text-stone-100">
          {after ?? "—"}%
        </span>
        {delta !== null && delta !== 0 ? (
          <span
            className={`text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type SegmentRewritesPanelProps = {
  originalDraft: string;
};

export function SegmentRewritesPanel({ originalDraft }: SegmentRewritesPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRetesting, setIsRetesting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lastGenerateSummary, setLastGenerateSummary] = useState<
    Array<{ segment: PersonaSegment; generatedVia: "cursor_sdk" | "openai_fallback" }> | null
  >(null);

  const rewrites = useQuery(api.segmentRewrites.listSegmentRewrites);
  const reactions = useQuery(api.agentReactions.listSwarmReactions);
  const generateRewrites = useAction(api.rewriteActions.generateSegmentRewrites);
  const retestVariants = useAction(api.rewriteActions.retestRewrittenVariants);

  const baselineScores = useMemo(() => {
    const display = pickDisplayReactions(reactions ?? [], 2);
    return computeSegmentScores(display);
  }, [reactions]);

  const afterScores = useMemo(() => {
    const round3 = pickReactionsForRound(reactions ?? [], 3);
    if (round3.length === 0) return null;
    return computeSegmentScores(round3);
  }, [reactions]);

  const rewritesBySegment = useMemo(() => {
    const map = new Map<
      PersonaSegment,
      NonNullable<typeof rewrites>[number]
    >();
    for (const row of rewrites ?? []) {
      map.set(row.segment as PersonaSegment, row);
    }
    return SEGMENT_ORDER.map((segment) => map.get(segment));
  }, [rewrites]);

  const hasRound3 = (reactions ?? []).some((r) => (r.round ?? 1) === 3);

  async function handleGenerate() {
    setClientError(null);
    setIsGenerating(true);
    try {
      const result = await generateRewrites({ originalDraft: originalDraft.trim() });
      setLastGenerateSummary(
        result.rewrites.map((r) => ({
          segment: r.segment,
          generatedVia: r.generatedVia,
        })),
      );
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Rewrite generation failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRetest() {
    setClientError(null);
    setIsRetesting(true);
    try {
      await retestVariants({});
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Re-test failed.",
      );
    } finally {
      setIsRetesting(false);
    }
  }

  const canGenerate = originalDraft.trim().length > 0 && !isGenerating && !isRetesting;
  const canRetest =
    (rewrites?.length ?? 0) === 3 && !isGenerating && !isRetesting;

  return (
    <section className="w-full space-y-5">
      <SectionHeader
        step={4}
        title="Segment rewrites"
        description="One optimized draft per segment, addressing the top objections from the swarm."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
          {isGenerating ? "Generating…" : "Generate rewrites"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleRetest}
          disabled={!canRetest || isRetesting}
        >
          {isRetesting ? "Re-testing…" : "Re-test variants"}
        </Button>
      </div>

      {lastGenerateSummary ? (
        <p className="text-xs text-stone-500">
          Last run engines:{" "}
          {lastGenerateSummary
            .map(
              (r) =>
                `${SEGMENT_LABELS[r.segment]}=${r.generatedVia === "cursor_sdk" ? "Cursor SDK" : "fallback"}`,
            )
            .join(" · ")}
        </p>
      ) : null}

      {clientError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {clientError}
        </p>
      ) : null}

      {(rewrites?.length ?? 0) === 0 && rewrites !== undefined ? (
        <p className="rounded-xl border border-dashed border-stone-800 bg-stone-900/40 px-4 py-6 text-center text-sm text-stone-500">
          Run the swarm first, then generate segment rewrites.
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {rewritesBySegment.map((row, index) => {
          const segment = SEGMENT_ORDER[index];
          const styles = SEGMENT_STYLES[segment];
          const baseline = baselineScores.find((s) => s.segment === segment);
          const after = afterScores?.find((s) => s.segment === segment);

          return (
            <article
              key={segment}
              className={`rounded-xl border bg-cream-deep p-4 ${styles.border}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-sm font-semibold ${styles.header}`}>
                  {SEGMENT_LABELS[segment]}
                </h3>
                {row ? <EngineBadge generatedVia={row.generatedVia} /> : null}
              </div>

              {baseline && baseline.topSignals.length > 0 ? (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
                    Addressing
                  </p>
                  <ul className="space-y-1">
                    {(row?.basedOnSignals ?? baseline.topSignals).map((signal) => (
                      <li
                        key={signal}
                        className="text-xs leading-relaxed text-stone-400"
                      >
                        &ldquo;{signal}&rdquo;
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {row ? (
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-900/40 p-3 font-mono text-xs leading-relaxed text-stone-200">
                  {row.rewrittenDraft}
                </pre>
              ) : (
                <p className="mt-3 text-sm text-stone-500">No rewrite yet.</p>
              )}

              {hasRound3 ? (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                    Before → after
                  </p>
                  <BeforeAfterScore
                    segment={segment}
                    before={baseline?.predictedReplyRate ?? null}
                    after={after?.predictedReplyRate ?? null}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {hasRound3 && afterScores ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            Round 3 complete — segment scores updated
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Baseline uses round 2 (or round 1) reactions; after uses round 3
            rewritten-variant tests per segment.
          </p>
        </div>
      ) : null}
    </section>
  );
}
