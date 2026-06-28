"use client";

import type { Doc } from "../convex/_generated/dataModel";
import {
  SEGMENT_LABELS,
  SEGMENT_STYLES,
  type PersonaSegment,
} from "../lib/segments";
import { normalizeLinkedInUrl } from "../lib/linkedinUrl";

function activityLabel(source: Doc<"leads">["activitySource"]): string {
  if (source === "latest_activities") return "Recent activity";
  if (source === "posts") return "Recent post";
  return "Activity";
}

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function SegmentBadge({ segment }: { segment: PersonaSegment }) {
  const styles = SEGMENT_STYLES[segment];
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}
    >
      {SEGMENT_LABELS[segment]}
    </span>
  );
}

export function PersonaCard({ lead }: { lead: Doc<"leads"> }) {
  const isLoading = lead.enrichmentStatus === "loading";
  const hasActivity =
    lead.recentActivity && lead.activitySource && lead.activitySource !== "none";
  const segmentStyles = lead.segment ? SEGMENT_STYLES[lead.segment] : null;
  const name = lead.personName ?? "Unknown";

  return (
    <article
      className={`rounded-xl border bg-cream-deep p-5 transition hover:shadow-md hover:shadow-black/25 ${
        segmentStyles?.border ?? "border-stone-800"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-sm font-semibold text-brand-blue-light">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-stone-100">{name}</h3>
            {lead.segment && <SegmentBadge segment={lead.segment} />}
          </div>
          {lead.role && (
            <p className="mt-0.5 text-sm text-stone-400">{lead.role}</p>
          )}
          {lead.companyName && (
            <p className="text-sm text-stone-400">{lead.companyName}</p>
          )}
        </div>
        {lead.intentScore != null && (
          <div className="shrink-0 rounded-lg border border-stone-800/60 bg-cream px-3 py-2 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
              Intent
            </p>
            <p className="text-xl font-semibold tabular-nums text-brand-blue-light">
              {lead.intentScore}
            </p>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-stone-500">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-800 border-t-brand-blue" />
          Enriching profile…
        </div>
      )}

      {lead.enrichmentError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {lead.enrichmentError}
        </p>
      )}

      <div className="mt-4 space-y-3 border-t border-stone-800/60 pt-4">
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
            {activityLabel(lead.activitySource)}
          </p>
          {hasActivity ? (
            <p className="mt-1 text-sm leading-relaxed text-stone-400">
              {lead.recentActivity}
            </p>
          ) : lead.enrichmentStatus === "complete" || lead.enrichmentStatus === "error" ? (
            <p className="mt-1 text-sm italic text-stone-400">
              No recent public activity
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-300">—</p>
          )}
        </section>

        {(lead.fundingStage || lead.painSignal) && (
          <section className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-cream p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                Funding
              </p>
              <p className="mt-1 text-sm text-stone-300">
                {lead.fundingStage ?? "Unknown"}
              </p>
            </div>
            <div className="rounded-lg bg-cream p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                Pain signal
              </p>
              <p className="mt-1 text-sm text-stone-300">
                {lead.painSignal ?? "Insufficient data"}
              </p>
            </div>
          </section>
        )}

        {lead.linkedinUrl && (
          <a
            href={normalizeLinkedInUrl(lead.linkedinUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-brand-blue-light hover:underline"
          >
            LinkedIn →
          </a>
        )}
      </div>
    </article>
  );
}
