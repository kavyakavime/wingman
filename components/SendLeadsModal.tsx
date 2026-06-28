"use client";

import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatEmailEditorValue,
  parseEmailEditorValue,
  resolveLeadEmailContent,
} from "@/lib/resolveLeadEmail";
import { SEGMENT_LABELS, SEGMENT_STYLES, type PersonaSegment } from "@/lib/segments";
import type { LeadRow } from "./workspace/LeadSpreadsheet";
import { Button } from "./ui/Button";

type SendLeadsModalProps = {
  open: boolean;
  onClose: () => void;
  leads: LeadRow[];
  simulationDraft: string;
};

type LeadSendRow = {
  leadId: Id<"leads">;
  personName: string;
  companyName: string;
  segment: PersonaSegment;
  source: "rewrite" | "simulation";
  toEmail: string;
  emailText: string;
  sending: boolean;
  sent: boolean;
  error: string | null;
};

const DEFAULT_FROM = "Connected Gmail (Convex env)";

export function SendLeadsModal({
  open,
  onClose,
  leads,
  simulationDraft,
}: SendLeadsModalProps) {
  const rewrites = useQuery(api.segmentRewrites.listSegmentRewrites);
  const sendLeadOutreach = useAction(api.sendActions.sendLeadOutreach);

  const rewriteBySegment = useMemo(() => {
    return new Map(
      (rewrites ?? []).map((row) => [row.segment as PersonaSegment, row.rewrittenDraft]),
    );
  }, [rewrites]);

  const [rows, setRows] = useState<LeadSendRow[]>([]);

  const buildRows = useCallback((): LeadSendRow[] => {
    return leads.map((lead) => {
      const resolved = resolveLeadEmailContent(lead, rewriteBySegment, simulationDraft);
      return {
        leadId: lead._id,
        personName: lead.personName ?? "Unknown",
        companyName: lead.companyName ?? "",
        segment: resolved.segment,
        source: resolved.source,
        toEmail: "",
        emailText: formatEmailEditorValue(resolved.subject, resolved.body),
        sending: false,
        sent: false,
        error: null,
      };
    });
  }, [leads, rewriteBySegment, simulationDraft]);

  useEffect(() => {
    if (open) {
      setRows(buildRows());
    }
  }, [open, buildRows]);

  function updateRow(leadId: Id<"leads">, patch: Partial<LeadSendRow>) {
    setRows((prev) => prev.map((row) => (row.leadId === leadId ? { ...row, ...patch } : row)));
  }

  async function handleSendOne(leadId: Id<"leads">) {
    const row = rows.find((r) => r.leadId === leadId);
    if (!row || row.sending) return;

    const toEmail = row.toEmail.trim();
    if (!toEmail.includes("@")) {
      updateRow(leadId, { error: "Enter a valid To email address." });
      return;
    }

    const { subject, body } = parseEmailEditorValue(row.emailText);
    if (!body.trim()) {
      updateRow(leadId, { error: "Email body cannot be empty." });
      return;
    }

    updateRow(leadId, { sending: true, error: null });
    try {
      await sendLeadOutreach({
        leadId,
        toEmail,
        subject,
        body,
      });
      updateRow(leadId, { sending: false, sent: true, error: null });
    } catch (error) {
      updateRow(leadId, {
        sending: false,
        error: error instanceof Error ? error.message : "Send failed.",
      });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-label="Send outreach to selected leads"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-800 bg-cream-deep shadow-2xl"
      >
        <div className="shrink-0 border-b border-stone-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-100">One-click send</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {rows.length} selected lead{rows.length === 1 ? "" : "s"} — review each email,
                then send.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-800 hover:text-stone-300"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {rows.map((row) => {
            const styles = SEGMENT_STYLES[row.segment];
            return (
              <article
                key={row.leadId}
                className={`rounded-xl border bg-cream/30 p-4 ${styles.border}`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="block text-xs font-medium text-stone-400">
                      Recipient
                      <input
                        type="text"
                        value={row.personName}
                        onChange={(e) => updateRow(row.leadId, { personName: e.target.value })}
                        disabled={row.sending}
                        className="mt-1 w-full rounded-lg border border-stone-800 bg-cream-deep px-3 py-2 text-sm text-stone-100 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:opacity-60"
                      />
                    </label>
                    <label className="block text-xs font-medium text-stone-400">
                      Company
                      <input
                        type="text"
                        value={row.companyName}
                        onChange={(e) => updateRow(row.leadId, { companyName: e.target.value })}
                        disabled={row.sending}
                        placeholder="Optional"
                        className="mt-1 w-full rounded-lg border border-stone-800 bg-cream-deep px-3 py-2 text-sm text-stone-100 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:opacity-60"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${styles.header}`}>
                      {SEGMENT_LABELS[row.segment]}
                    </span>
                    <span className="rounded-full bg-stone-700/60 px-2 py-0.5 text-[10px] text-stone-400">
                      {row.source === "rewrite" ? "Rewrite" : "Simulation draft"}
                    </span>
                    {row.sent ? (
                      <span className="text-xs font-medium text-emerald-600">Sent</span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-stone-400">
                    To
                    <input
                      type="email"
                      value={row.toEmail}
                      onChange={(e) => updateRow(row.leadId, { toEmail: e.target.value })}
                      placeholder="name@company.com"
                      disabled={row.sending}
                      className="mt-1 w-full rounded-lg border border-stone-800 bg-cream-deep px-3 py-2 text-sm text-stone-100 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:opacity-60"
                    />
                  </label>
                  <label className="block text-xs font-medium text-stone-400">
                    From
                    <input
                      type="text"
                      value={DEFAULT_FROM}
                      readOnly
                      tabIndex={-1}
                      className="mt-1 w-full cursor-not-allowed rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2 text-sm text-stone-500"
                    />
                  </label>
                  <label className="block text-xs font-medium text-stone-400">
                    Email
                    <textarea
                      value={row.emailText}
                      onChange={(e) => updateRow(row.leadId, { emailText: e.target.value })}
                      rows={8}
                      disabled={row.sending}
                      className="mt-1 w-full resize-y rounded-lg border border-stone-800 bg-cream-deep px-3 py-2 font-mono text-xs leading-relaxed text-stone-200 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:opacity-60"
                    />
                  </label>
                </div>

                {row.error ? (
                  <p className="mt-2 text-xs text-red-600">{row.error}</p>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void handleSendOne(row.leadId)}
                    disabled={row.sending}
                  >
                    {row.sent ? "Send again" : row.sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-stone-800 px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose} fullWidth>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
