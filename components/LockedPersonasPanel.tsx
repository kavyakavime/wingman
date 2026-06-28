"use client";

import { useAction, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { LOCKED_DEMO_PERSONAS } from "../lib/lockedPersonas";
import {
  SEGMENT_DESCRIPTIONS,
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  SEGMENT_STYLES,
  type PersonaSegment,
} from "../lib/segments";
import { PersonaCard } from "./PersonaCard";

export function LockedPersonasPanel() {
  const [isEnriching, setIsEnriching] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const lockedPersonas = useQuery(api.leads.listLockedPersonas);
  const enrichLockedPersonas = useAction(api.enrichActions.enrichLockedPersonas);

  const grouped = useMemo(() => {
    if (!lockedPersonas) return null;

    const buckets: Record<PersonaSegment, Doc<"leads">[]> = {
      scaled: [],
      early_stage: [],
      vertical_specialist: [],
    };

    for (const lead of lockedPersonas) {
      if (lead.segment) buckets[lead.segment].push(lead);
    }

    return buckets;
  }, [lockedPersonas]);

  const anyLoading =
    isEnriching ||
    (lockedPersonas?.some((lead) => lead.enrichmentStatus === "loading") ?? false);

  async function handleEnrich() {
    setClientError(null);
    setIsEnriching(true);
    try {
      await enrichLockedPersonas({});
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Enrichment failed unexpectedly.",
      );
    } finally {
      setIsEnriching(false);
    }
  }

  return (
    <section className="w-full space-y-4">
      <div className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Locked demo personas
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Six real profiles grouped by segment — the same tags hour 6&apos;s graph
          will cluster on.
        </p>
        <p className="text-xs text-zinc-500">
          {LOCKED_DEMO_PERSONAS.map((p) => p.personName).join(" · ")}
        </p>
      </div>

      <button
        type="button"
        onClick={handleEnrich}
        disabled={anyLoading}
        className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        {anyLoading ? "Enriching personas…" : "Enrich locked personas"}
      </button>

      {clientError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {clientError}
        </p>
      )}

      {lockedPersonas === undefined ? (
        <p className="text-sm text-zinc-500">Loading personas…</p>
      ) : lockedPersonas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
          Click &ldquo;Enrich locked personas&rdquo; to seed and enrich the six
          demo profiles.
        </p>
      ) : grouped ? (
        <div className="space-y-8">
          {SEGMENT_ORDER.map((segment) => {
            const leads = grouped[segment];
            if (leads.length === 0) return null;
            const styles = SEGMENT_STYLES[segment];
            return (
              <div key={segment} className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`text-sm font-semibold ${styles.header}`}>
                    {SEGMENT_LABELS[segment]}
                  </h3>
                  <span className="text-xs text-zinc-500">
                    {SEGMENT_DESCRIPTIONS[segment]} · {leads.length}
                  </span>
                </div>
                <div className="grid gap-4">
                  {leads.map((lead) => (
                    <PersonaCard key={lead._id} lead={lead} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
