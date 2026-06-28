"use client";

import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { inferLeadSegment } from "@/lib/inferSegment";
import { resolveLeadEmailContent } from "@/lib/resolveLeadEmail";
import { SEGMENT_LABELS, SEGMENT_STYLES, type PersonaSegment } from "@/lib/segments";
import { Button } from "../ui/Button";
import type { LeadRow } from "./LeadSpreadsheet";

const gridLine = "border-stone-400/25";
const th =
  `border-r ${gridLine} px-4 py-3 text-left font-semibold uppercase tracking-wide text-brand-blue-light/90`;
const td =
  `border-r ${gridLine} px-4 py-3 text-stone-400`;
const tdNum = `${td} text-center font-mono text-[11px] text-stone-400`;
const tdName = `${td} font-bold text-stone-100`;

function EmailPreviewCell({ subject, body }: { subject: string; body: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = body.trim() || "—";
  const canExpand = preview !== "—";

  return (
    <td className={`${td} max-w-[280px] align-top text-xs text-stone-500`}>
      <p className="mb-1 font-medium text-stone-300">{subject}</p>
      <div
        className={`relative min-h-[2.5rem] rounded-md border border-transparent pr-5 ${
          expanded ? "border-stone-400/15 bg-stone-900/50 p-2" : ""
        }`}
      >
        <p
          className={
            expanded
              ? "whitespace-pre-wrap font-mono leading-relaxed text-stone-300"
              : "line-clamp-3 font-mono leading-snug"
          }
        >
          {preview}
        </p>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="absolute bottom-0 right-0 rounded-sm bg-stone-800/95 px-1 py-0.5 text-[10px] text-stone-400 ring-1 ring-white/10 hover:text-stone-100"
            aria-expanded={expanded}
          >
            {expanded ? "Less" : "More"}
          </button>
        ) : null}
      </div>
    </td>
  );
}

type RewriteSpreadsheetProps = {
  leads: LeadRow[];
  rewriteBySegment: Map<PersonaSegment, string>;
  generatedViaBySegment: Map<PersonaSegment, "cursor_sdk" | "openai_fallback">;
  simulationDraft: string;
  selectedIds: Set<Id<"leads">>;
  onToggleLead: (id: Id<"leads">) => void;
  onToggleAll: (checked: boolean) => void;
  onOpenSend: (leadId: Id<"leads">) => void;
};

export function RewriteSpreadsheet({
  leads,
  rewriteBySegment,
  generatedViaBySegment,
  simulationDraft,
  selectedIds,
  onToggleLead,
  onToggleAll,
  onOpenSend,
}: RewriteSpreadsheetProps) {
  const rows = useMemo(
    () =>
      leads.map((lead) => {
        const resolved = resolveLeadEmailContent(lead, rewriteBySegment, simulationDraft);
        const segment = inferLeadSegment({
          _id: lead._id,
          personName: lead.personName,
          role: lead.role,
        });
        return { lead, resolved, segment };
      }),
    [leads, rewriteBySegment, simulationDraft],
  );

  const allSelected =
    rows.length > 0 && rows.every(({ lead }) => selectedIds.has(lead._id));
  const someSelected = rows.some(({ lead }) => selectedIds.has(lead._id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-cream/40">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-stone-500">
            Select leads in the Leads tab to see rewritten emails here.
          </div>
        ) : (
          <div className="p-3">
            <table
              className={`w-full min-w-[920px] overflow-hidden rounded-lg border ${gridLine} border-collapse text-left text-[13px] shadow-sm`}
            >
              <thead
                className={`sticky top-0 z-10 border-b ${gridLine} bg-gradient-to-b from-brand-blue/25 to-brand-blue/10 text-[11px]`}
              >
                <tr>
                  <th className={`${th} w-11 text-center`}>#</th>
                  <th className={`${th} w-11 text-center`}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => onToggleAll(e.target.checked)}
                      className="h-4 w-4 rounded border-brand-blue/40 accent-brand-blue-light"
                      aria-label="Select all rewritten emails"
                    />
                  </th>
                  <th className={th}>Name</th>
                  <th className={th}>Company</th>
                  <th className={th}>Segment</th>
                  <th className={`${th} min-w-[280px]`}>Rewritten email</th>
                  <th className={th}>Source</th>
                  <th className={`${th} border-r-0 text-center`}>Send</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ lead, resolved, segment }, index) => {
                  const selected = selectedIds.has(lead._id);
                  const styles = SEGMENT_STYLES[segment];
                  const via = generatedViaBySegment.get(segment);
                  return (
                    <tr
                      key={lead._id}
                      className={`border-b ${gridLine} transition ${
                        selected
                          ? "bg-cream-deep text-stone-100"
                          : "bg-stone-800/40 text-stone-400"
                      } hover:bg-stone-800/50`}
                    >
                      <td className={tdNum}>{index + 1}</td>
                      <td className={`${td} text-center`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onToggleLead(lead._id)}
                          className="h-4 w-4 rounded border-stone-700 accent-brand-blue"
                          aria-label={`Select ${lead.personName ?? "lead"}`}
                        />
                      </td>
                      <td className={tdName}>{lead.personName ?? "—"}</td>
                      <td
                        className={`${td} max-w-[140px] truncate font-medium text-stone-300`}
                        title={lead.companyName ?? undefined}
                      >
                        {lead.companyName ?? "—"}
                      </td>
                      <td className={td}>
                        <span className={`text-xs font-semibold ${styles.header}`}>
                          {SEGMENT_LABELS[segment]}
                        </span>
                      </td>
                      <EmailPreviewCell subject={resolved.subject} body={resolved.body} />
                      <td className={`${td} text-xs`}>
                        {resolved.source === "rewrite" ? (
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${
                              via === "cursor_sdk"
                                ? "bg-brand-blue/20 text-brand-blue-light"
                                : "bg-orange-500/20 text-orange-300"
                            }`}
                          >
                            {via === "cursor_sdk" ? "Cursor SDK" : "OpenAI fallback"}
                          </span>
                        ) : (
                          <span className="text-stone-500">Simulation draft</span>
                        )}
                      </td>
                      <td className={`${td} border-r-0 text-center align-middle`}>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => onOpenSend(lead._id)}
                          className="whitespace-nowrap px-2.5 py-1 text-[11px]"
                        >
                          One-click send
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
