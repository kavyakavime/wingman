"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

/** Locked hackathon ICP — do not change during the build. */
export const LOCKED_ICP =
  "VPs of Sales and CFOs at Series A and Series B SaaS companies in the United States";

export function AudienceSearch() {
  const [icp, setIcp] = useState(LOCKED_ICP);
  const [activeRunId, setActiveRunId] = useState<Id<"audienceRuns"> | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const prepareSearch = useMutation(api.leads.startSearch);
  const fetchAudience = useAction(api.fiberActions.fetchAudience);
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
    <section className="w-full space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Find your audience
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Fiber AI pulls real, live people and companies matching your ICP.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="icp" className="sr-only">
          Ideal customer profile
        </label>
        <textarea
          id="icp"
          value={icp}
          onChange={(e) => setIcp(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none ring-zinc-900/10 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          placeholder="e.g. VPs of Sales at Series B fintech startups in New York"
        />
        <button
          type="submit"
          disabled={isLoading || !icp.trim()}
          className="w-full rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isLoading ? "Searching Fiber…" : "Find my audience"}
        </button>
      </form>

      {clientError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {clientError}
        </p>
      )}

      {run?.status === "error" && run.errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {run.errorMessage}
        </p>
      )}

      {isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          Querying Fiber for live matches…
          {leads && leads.length > 0 && (
            <span className="ml-auto font-mono text-xs text-zinc-500">
              {leads.length} found so far
            </span>
          )}
        </div>
      )}

      {run?.status === "empty" && !isLoading && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No matches for this ICP. Try broadening the role, stage, or geography.
        </p>
      )}

      {leads && leads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {run?.resultType === "companies" ? "Companies" : "People"} from
              Fiber
            </span>
            <span className="font-mono">
              {leads.length}
              {isLoading ? "+" : ""} live results
            </span>
          </div>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {leads.map((lead) => (
              <li
                key={lead._id}
                className="bg-white px-4 py-4 dark:bg-zinc-950"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {lead.personName ?? lead.companyName ?? "Unknown"}
                  </p>
                  {lead.role && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {lead.role}
                    </p>
                  )}
                  {lead.companyName && lead.personName && (
                    <p className="text-sm text-zinc-500">{lead.companyName}</p>
                  )}
                  {lead.socialSignal && (
                    <p className="text-sm text-zinc-500 line-clamp-2">
                      {lead.socialSignal}
                    </p>
                  )}
                  {lead.locality && (
                    <p className="text-xs text-zinc-400">{lead.locality}</p>
                  )}
                  {lead.linkedinUrl && (
                    <a
                      href={lead.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
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
    </section>
  );
}
