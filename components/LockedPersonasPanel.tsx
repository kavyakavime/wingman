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
import { Button } from "./ui/Button";
import { Panel, PanelBody } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";

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
    <Panel id="personas">
      <PanelBody className="space-y-6">
        <SectionHeader
          step={2}
          title="Digital twin personas"
          description="Six real profiles across three segments — enriched with funding, pain signals, and intent."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={handleEnrich}
              disabled={anyLoading}
            >
              {anyLoading ? "Enriching…" : "Enrich all"}
            </Button>
          }
        />

        <p className="rounded-xl bg-cream px-4 py-3 text-xs text-stone-500">
          {LOCKED_DEMO_PERSONAS.map((p) => p.personName).join(" · ")}
        </p>

        {clientError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {clientError}
          </p>
        )}

        {lockedPersonas === undefined ? (
          <p className="text-sm text-stone-500">Loading personas…</p>
        ) : lockedPersonas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-800 bg-cream px-6 py-10 text-center">
            <p className="text-sm text-stone-500">
              Hit &ldquo;Enrich all&rdquo; to seed and enrich the demo profiles.
            </p>
          </div>
        ) : grouped ? (
          <div className="space-y-8">
            {SEGMENT_ORDER.map((segment) => {
              const leads = grouped[segment];
              if (leads.length === 0) return null;
              const styles = SEGMENT_STYLES[segment];
              return (
                <div key={segment} className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-stone-800/60 pb-3">
                    <h3 className={`text-sm font-semibold ${styles.header}`}>
                      {SEGMENT_LABELS[segment]}
                    </h3>
                    <span className="text-xs text-stone-400">
                      {SEGMENT_DESCRIPTIONS[segment]} · {leads.length}
                    </span>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {leads.map((lead) => (
                      <PersonaCard key={lead._id} lead={lead} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
