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
import { channelLabel, type OutreachChannel } from "@/lib/outreachChannel";
import { SEGMENT_LABELS, SEGMENT_STYLES, type PersonaSegment } from "@/lib/segments";
import type { LeadRow } from "./workspace/LeadSpreadsheet";
import { Button } from "./ui/Button";

type SendLeadsModalProps = {
  open: boolean;
  onClose: () => void;
  leads: LeadRow[];
  simulationDraft: string;
  channel: OutreachChannel | null;
};

type LeadSendRow = {
  leadId: Id<"leads">;
  personName: string;
  companyName: string;
  segment: PersonaSegment;
  source: "rewrite" | "simulation";
  toEmail: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  emailText: string;
  sending: boolean;
  sent: boolean;
  error: string | null;
  via: "managed_email" | "gmail" | "gmail_direct" | "lob" | null;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-800 bg-cream-deep px-3 py-2 text-sm text-stone-100 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:opacity-60";

export function SendLeadsModal({
  open,
  onClose,
  leads,
  simulationDraft,
  channel,
}: SendLeadsModalProps) {
  const sendChannel: OutreachChannel = channel ?? "email";
  const isPhysicalMail = sendChannel === "physical_mail";

  const rewrites = useQuery(api.segmentRewrites.listSegmentRewrites);
  const sendConfig = useQuery(api.sendConfig.getSendConfig);
  const sendLeadOutreach = useAction(api.sendActions.sendLeadOutreach);
  const sendLeadPhysicalMail = useAction(api.sendActions.sendLeadPhysicalMail);

  const fromLabel = isPhysicalMail
    ? sendConfig?.lobFromAddress ??
      (sendConfig?.lobConfigured
        ? "Lob return address"
        : "Not configured — set LOB_FROM_ADDRESS in Convex env")
    : sendConfig?.fromEmail
      ? sendConfig.fromEmail
      : sendConfig?.smtpConfigured
        ? "Gmail SMTP"
        : "Not configured — set GMAIL_USER in Convex env";

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
        addressLine1: "",
        addressLine2: "",
        addressCity: "",
        addressState: "",
        addressZip: "",
        emailText: formatEmailEditorValue(resolved.subject, resolved.body),
        sending: false,
        sent: false,
        error: null,
        via: null,
      };
    });
  }, [leads, rewriteBySegment, simulationDraft]);

  useEffect(() => {
    if (open) {
      setRows(buildRows());
    }
  }, [open, buildRows, sendChannel]);

  function updateRow(leadId: Id<"leads">, patch: Partial<LeadSendRow>) {
    setRows((prev) => prev.map((row) => (row.leadId === leadId ? { ...row, ...patch } : row)));
  }

  async function handleSendOne(leadId: Id<"leads">) {
    const row = rows.find((r) => r.leadId === leadId);
    if (!row || row.sending) return;

    const { subject, body } = parseEmailEditorValue(row.emailText);
    if (!body.trim()) {
      updateRow(leadId, {
        error: isPhysicalMail ? "Letter body cannot be empty." : "Email body cannot be empty.",
      });
      return;
    }

    if (isPhysicalMail) {
      if (!row.addressLine1.trim()) {
        updateRow(leadId, { error: "Street address is required." });
        return;
      }
      if (!row.addressCity.trim() || !row.addressState.trim() || !row.addressZip.trim()) {
        updateRow(leadId, { error: "City, state, and ZIP are required." });
        return;
      }
    } else {
      const toEmail = row.toEmail.trim();
      if (!toEmail.includes("@")) {
        updateRow(leadId, { error: "Enter a valid To email address." });
        return;
      }
      if (!subject.trim()) {
        updateRow(leadId, { error: "Subject cannot be empty." });
        return;
      }
    }

    updateRow(leadId, { sending: true, error: null });
    try {
      if (isPhysicalMail) {
        const result = await sendLeadPhysicalMail({
          leadId,
          recipientName: row.personName.trim() || "Recipient",
          addressLine1: row.addressLine1.trim(),
          addressLine2: row.addressLine2.trim() || undefined,
          addressCity: row.addressCity.trim(),
          addressState: row.addressState.trim(),
          addressZip: row.addressZip.trim(),
          subject: subject.trim() || "Quick note",
          body,
        });
        updateRow(leadId, {
          sending: false,
          sent: true,
          error: null,
          via: result.via,
        });
      } else {
        const result = await sendLeadOutreach({
          leadId,
          toEmail: row.toEmail.trim(),
          subject,
          body,
        });
        updateRow(leadId, {
          sending: false,
          sent: true,
          error: null,
          via: result.via ?? null,
        });
      }
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
        aria-label={`Send ${channelLabel(sendChannel)} outreach to selected leads`}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-800 bg-cream-deep shadow-2xl"
      >
        <div className="shrink-0 border-b border-stone-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-100">One-click send</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {rows.length} selected lead{rows.length === 1 ? "" : "s"} —{" "}
                {isPhysicalMail
                  ? "review each letter, enter a mailing address, then send via Lob."
                  : "review each email, then send."}
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isPhysicalMail
                    ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                    : "bg-brand-blue/15 text-brand-blue-light ring-1 ring-brand-blue/30"
                }`}
              >
                {channelLabel(sendChannel)}
              </span>
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
                      {isPhysicalMail ? "Recipient name" : "Recipient"}
                      <input
                        type="text"
                        value={row.personName}
                        onChange={(e) => updateRow(row.leadId, { personName: e.target.value })}
                        disabled={row.sending}
                        className={inputClass}
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
                        className={inputClass}
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
                      <span className="text-xs font-medium text-emerald-600">
                        Sent
                        {row.via === "gmail_direct"
                          ? " via Gmail"
                          : row.via === "lob"
                            ? " via Lob"
                            : null}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  {isPhysicalMail ? (
                    <>
                      <label className="block text-xs font-medium text-stone-400">
                        Street address
                        <input
                          type="text"
                          value={row.addressLine1}
                          onChange={(e) =>
                            updateRow(row.leadId, { addressLine1: e.target.value })
                          }
                          placeholder="123 Main St"
                          disabled={row.sending}
                          className={inputClass}
                        />
                      </label>
                      <label className="block text-xs font-medium text-stone-400">
                        Apt / suite <span className="text-stone-600">(optional)</span>
                        <input
                          type="text"
                          value={row.addressLine2}
                          onChange={(e) =>
                            updateRow(row.leadId, { addressLine2: e.target.value })
                          }
                          disabled={row.sending}
                          className={inputClass}
                        />
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        <label className="col-span-3 block text-xs font-medium text-stone-400">
                          City
                          <input
                            type="text"
                            value={row.addressCity}
                            onChange={(e) =>
                              updateRow(row.leadId, { addressCity: e.target.value })
                            }
                            disabled={row.sending}
                            className={inputClass}
                          />
                        </label>
                        <label className="col-span-1 block text-xs font-medium text-stone-400">
                          State
                          <input
                            type="text"
                            value={row.addressState}
                            onChange={(e) =>
                              updateRow(row.leadId, {
                                addressState: e.target.value.toUpperCase().slice(0, 2),
                              })
                            }
                            placeholder="CA"
                            maxLength={2}
                            disabled={row.sending}
                            className={inputClass}
                          />
                        </label>
                        <label className="col-span-2 block text-xs font-medium text-stone-400">
                          ZIP
                          <input
                            type="text"
                            value={row.addressZip}
                            onChange={(e) => updateRow(row.leadId, { addressZip: e.target.value })}
                            placeholder="94107"
                            disabled={row.sending}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="block text-xs font-medium text-stone-400">
                      To
                      <input
                        type="email"
                        value={row.toEmail}
                        onChange={(e) => updateRow(row.leadId, { toEmail: e.target.value })}
                        placeholder="name@company.com"
                        disabled={row.sending}
                        className={inputClass}
                      />
                    </label>
                  )}
                  <label className="block text-xs font-medium text-stone-400">
                    From
                    <input
                      type="text"
                      value={fromLabel}
                      readOnly
                      tabIndex={-1}
                      className="mt-1 w-full cursor-not-allowed rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2 text-sm text-stone-500"
                    />
                  </label>
                  <label className="block text-xs font-medium text-stone-400">
                    {isPhysicalMail ? "Letter" : "Email"}
                    <textarea
                      value={row.emailText}
                      onChange={(e) => updateRow(row.leadId, { emailText: e.target.value })}
                      rows={8}
                      disabled={row.sending}
                      className="mt-1 w-full resize-y rounded-lg border border-stone-800 bg-cream-deep px-3 py-2 font-mono text-xs leading-relaxed text-stone-200 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:opacity-60"
                    />
                  </label>
                  {isPhysicalMail ? (
                    <p className="text-[11px] leading-relaxed text-stone-500">
                      Lob prints and mails a black-and-white letter. Test API keys create
                      printable proofs without charging postage.
                    </p>
                  ) : null}
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
                    {row.sent
                      ? "Send again"
                      : row.sending
                        ? isPhysicalMail
                          ? "Mailing…"
                          : "Sending…"
                        : isPhysicalMail
                          ? "Mail letter"
                          : "Send"}
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
