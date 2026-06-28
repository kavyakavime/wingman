"use client";

import type { Doc } from "../convex/_generated/dataModel";

function activityLabel(source: Doc<"leads">["activitySource"]): string {
  if (source === "latest_activities") return "Latest LinkedIn activity (Fiber)";
  if (source === "posts") return "Recent post (Fiber fallback)";
  return "No recent public activity";
}

export function PersonaCard({ lead }: { lead: Doc<"leads"> }) {
  const isLoading = lead.enrichmentStatus === "loading";
  const hasActivity =
    lead.recentActivity && lead.activitySource && lead.activitySource !== "none";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {lead.personName ?? "Unknown"}
          </h3>
          {lead.role && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{lead.role}</p>
          )}
          {lead.companyName && (
            <p className="text-sm text-zinc-500">{lead.companyName}</p>
          )}
        </div>
        {lead.intentScore != null && (
          <div className="rounded-lg bg-zinc-100 px-3 py-2 text-center dark:bg-zinc-900">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              Intent
            </p>
            <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {lead.intentScore}
            </p>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-700 dark:border-t-zinc-200" />
          Fetching live activity + enriching…
        </div>
      )}

      {lead.enrichmentError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {lead.enrichmentError}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {activityLabel(lead.activitySource)}
          </p>
          {hasActivity ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {lead.recentActivity}
            </p>
          ) : lead.enrichmentStatus === "complete" || lead.enrichmentStatus === "error" ? (
            <p className="mt-1 text-sm italic text-zinc-500">
              No recent public activity
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-400">—</p>
          )}
        </section>

        {(lead.fundingStage || lead.painSignal) && (
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/60">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Funding stage
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {lead.fundingStage ?? "Unknown"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/60 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Pain signal
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {lead.painSignal ?? "Insufficient data"}
              </p>
            </div>
          </section>
        )}

        {lead.linkedinUrl && (
          <a
            href={lead.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View LinkedIn profile
          </a>
        )}
      </div>
    </article>
  );
}
