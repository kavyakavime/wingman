"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { FormEvent, useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { DEFAULT_SWARM_DRAFT } from "../lib/swarmDraft";
import {
  deriveGraphPersonas,
  pickDisplayReactions,
} from "../lib/swarmGraphData";
import { normalizeLinkedInUrl } from "../lib/linkedinUrl";
import { SwarmGraph } from "./SwarmGraph";
import { Button } from "./ui/Button";
import { Panel, PanelBody } from "./ui/Panel";
import { SectionHeader } from "./ui/SectionHeader";
import {
  SEGMENT_LABELS,
  SEGMENT_STYLES,
  type PersonaSegment,
} from "../lib/segments";

/** Locked demo ICP — do not change during the build. */
export const LOCKED_ICP =
  "VPs of Sales and CFOs at Series A and Series B SaaS companies in the United States";

export function AudienceSearch() {
  const [icp, setIcp] = useState(LOCKED_ICP);
  const [activeRunId, setActiveRunId] = useState<Id<"audienceRuns"> | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwarmRunning, setIsSwarmRunning] = useState(false);
  const [includeRound2, setIncludeRound2] = useState(true);
  const [swarmError, setSwarmError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const prepareSearch = useMutation(api.leads.startSearch);
  const fetchAudience = useAction(api.fiberActions.fetchAudience);
  const runSwarm = useAction(api.swarmActions.runSwarm);
  const allReactions = useQuery(api.agentReactions.listSwarmReactions);
  const run = useQuery(
    api.leads.getRun,
    activeRunId ? { runId: activeRunId } : "skip",
  );
  const leads = useQuery(
    api.leads.listByRun,
    activeRunId ? { runId: activeRunId } : "skip",
  );

  const isLoading =
    isSubmitting || (run !== undefined && run !== null && run.status === "loading");

  const searchLeadIds = useMemo(
    () => (leads ?? []).map((lead) => lead._id),
    [leads],
  );

  const searchPersonas = useMemo(
    () =>
      (leads ?? []).map((lead) => ({
        _id: lead._id,
        personName: lead.personName ?? lead.companyName,
        segment: lead.segment,
      })),
    [leads],
  );

  const searchReactionsRaw = useMemo(() => {
    if (!allReactions || searchLeadIds.length === 0) return [];
    const idSet = new Set(searchLeadIds);
    return allReactions.filter((reaction) => idSet.has(reaction.leadId));
  }, [allReactions, searchLeadIds]);

  const searchReactions = useMemo(
    () => pickDisplayReactions(searchReactionsRaw, 2),
    [searchReactionsRaw],
  );

  const searchGraphPersonas = useMemo(
    () => deriveGraphPersonas(searchPersonas, searchReactionsRaw),
    [searchPersonas, searchReactionsRaw],
  );

  const canTestSwarm =
    !isLoading &&
    run?.status === "complete" &&
    searchLeadIds.length > 0 &&
    run?.resultType === "people";

  async function handleTestSwarm() {
    setSwarmError(null);
    setIsSwarmRunning(true);
    try {
      await runSwarm({
        draftMessage: DEFAULT_SWARM_DRAFT,
        leadIds: searchLeadIds,
        includeRound2,
      });
    } catch (error) {
      setSwarmError(
        error instanceof Error ? error.message : "Swarm run failed unexpectedly.",
      );
    } finally {
      setIsSwarmRunning(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(null);
    setIsSubmitting(true);

    try {
      const trimmedIcp = icp.trim();
      const runId = await prepareSearch({ icp: trimmedIcp });
      setActiveRunId(runId);
      await fetchAudience({ runId, icp: trimmedIcp });
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Search failed unexpectedly.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Panel id="audience">
      <PanelBody className="space-y-6">
        <SectionHeader
          step={1}
          title="Define your audience"
          description="Describe your ICP in plain English. We pull real decision-makers from live data."
        />

      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="icp" className="sr-only">
          Ideal customer profile
        </label>
        <textarea
          id="icp"
          value={icp}
          onChange={(e) => setIcp(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl border border-stone-800 bg-cream px-4 py-3.5 text-sm leading-relaxed text-stone-100 shadow-inner shadow-black/20 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          placeholder="e.g. VPs of Sales at Series B fintech startups in New York"
        />
        <Button type="submit" fullWidth disabled={isLoading || !icp.trim()}>
          {isLoading ? "Searching…" : "Find audience"}
        </Button>
      </form>

      {clientError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {clientError}
        </p>
      )}

      {run?.status === "error" && run.errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {run.errorMessage}
        </p>
      )}

      {isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-900/40 px-4 py-4 text-sm text-stone-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-800 border-t-stone-300" />
          Querying for live matches...
          {leads && leads.length > 0 && (
            <span className="ml-auto font-mono text-xs text-stone-500">
              {leads.length} found so far
            </span>
          )}
        </div>
      )}

      {run?.status === "empty" && !isLoading && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          No matches for this ICP. Try broadening the role, stage, or geography.
        </p>
      )}

      {leads && leads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>
              {run?.resultType === "companies" ? "Companies" : "People"} found
            </span>
            <span className="font-mono">
              {leads.length}
              {isLoading ? "+" : ""} live results
            </span>
          </div>

          {canTestSwarm && (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-400">
                <input
                  type="checkbox"
                  checked={includeRound2}
                  onChange={(e) => setIncludeRound2(e.target.checked)}
                  disabled={isSwarmRunning}
                  className="h-4 w-4 rounded border-stone-800"
                />
                Include round 2 (peer influence)
              </label>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={handleTestSwarm}
                disabled={isSwarmRunning}
              >
                {isSwarmRunning
                  ? "Running swarm…"
                  : "Test swarm on results"}
              </Button>
            </div>
          )}

          {swarmError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {swarmError}
            </p>
          )}

          {(canTestSwarm || searchGraphPersonas.length > 0) && (
            <SwarmGraph
              personas={
                leads === undefined ? undefined : searchGraphPersonas
              }
              reactions={searchReactionsRaw}
              isSwarmRunning={isSwarmRunning}
              emptyMessage="Run a search, then test the swarm to populate the graph."
            />
          )}

          {searchReactions.length > 0 && (
            <ul className="space-y-3">
              {searchReactions.map((reaction) => {
                const segment = reaction.segment as PersonaSegment | undefined;
                const segmentStyle = segment ? SEGMENT_STYLES[segment] : null;
                const sentimentLabel =
                  reaction.sentiment === "positive"
                    ? "Positive"
                    : reaction.sentiment === "objecting"
                      ? "Objecting"
                      : "Neutral";
                const sentimentClass =
                  reaction.sentiment === "positive"
                    ? "bg-emerald-100 text-emerald-900"
                    : reaction.sentiment === "objecting"
                      ? "bg-rose-100 text-rose-900"
                      : "bg-amber-100 text-amber-900";

                return (
                  <li
                    key={`${reaction.leadId}-${reaction.round ?? 1}`}
                    className="rounded-lg border border-stone-800 bg-stone-900/40 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-medium text-stone-100">
                        {reaction.personName}
                      </p>
                      {segment && segmentStyle ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${segmentStyle.badge}`}
                        >
                          {SEGMENT_LABELS[segment]}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${sentimentClass}`}
                      >
                        {sentimentLabel}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-stone-300">
                      {reaction.reasoningText}
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      Cited: &ldquo;{reaction.citedSignal}&rdquo;
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-800 bg-cream/40">
            {leads.map((lead) => (
              <li
                key={lead._id}
                className="bg-cream-deep px-5 py-4 transition hover:bg-cream/30"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-stone-100">
                    {lead.personName ?? lead.companyName ?? "Unknown"}
                  </p>
                  {lead.role && (
                    <p className="text-sm text-stone-400">
                      {lead.role}
                    </p>
                  )}
                  {lead.companyName && lead.personName && (
                    <p className="text-sm text-stone-500">{lead.companyName}</p>
                  )}
                  {lead.socialSignal && (
                    <p className="text-sm text-stone-500 line-clamp-2">
                      {lead.socialSignal}
                    </p>
                  )}
                  {lead.locality && (
                    <p className="text-xs text-stone-400">{lead.locality}</p>
                  )}
                  {lead.linkedinUrl && (
                    <a
                      href={normalizeLinkedInUrl(lead.linkedinUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-blue-light hover:underline"
                    >
                      LinkedIn profile
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      </PanelBody>
    </Panel>
  );
}
