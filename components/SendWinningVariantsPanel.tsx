"use client";

import { useAction, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import { DEMO_RECIPIENTS } from "../lib/demoRecipients";
import { parseRewriteDraft } from "../lib/parseRewriteDraft";
import {
  SEGMENT_LABELS,
  SEGMENT_STYLES,
  type PersonaSegment,
} from "../lib/segments";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";

type PreviewRow = {
  label: string;
  email: string;
  segment: PersonaSegment;
  subject: string;
  body: string;
  missingRewrite: boolean;
};

export function SendWinningVariantsPanel() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lastSendResults, setLastSendResults] = useState<
    Array<{
      recipientEmail: string;
      recipientLabel: string;
      segment: PersonaSegment;
      success: boolean;
      errorMessage: string | null;
      subject: string;
    }> | null
  >(null);

  const rewrites = useQuery(api.segmentRewrites.listSegmentRewrites);
  const sentLog = useQuery(api.sentLog.listSentLog);
  const sendWinningVariants = useAction(api.sendActions.sendWinningVariants);

  const previews = useMemo((): PreviewRow[] => {
    const bySegment = new Map(
      (rewrites ?? []).map((row) => [row.segment as PersonaSegment, row.rewrittenDraft]),
    );

    return DEMO_RECIPIENTS.map((recipient) => {
      const draft = bySegment.get(recipient.segment);
      if (!draft) {
        return {
          label: recipient.label,
          email: recipient.email,
          segment: recipient.segment,
          subject: "(no rewrite yet)",
          body: "",
          missingRewrite: true,
        };
      }
      try {
        const { subject, body } = parseRewriteDraft(draft);
        return {
          label: recipient.label,
          email: recipient.email,
          segment: recipient.segment,
          subject,
          body,
          missingRewrite: false,
        };
      } catch {
        return {
          label: recipient.label,
          email: recipient.email,
          segment: recipient.segment,
          subject: "(parse error)",
          body: draft.slice(0, 300),
          missingRewrite: true,
        };
      }
    });
  }, [rewrites]);

  const canSend =
    previews.length > 0 &&
    previews.every((p) => !p.missingRewrite) &&
    !isSending;

  async function handleConfirmSend() {
    setClientError(null);
    setIsSending(true);
    try {
      const result = await sendWinningVariants({ confirmed: true });
      setLastSendResults(result.results);
      setShowConfirm(false);
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Send failed unexpectedly.",
      );
    } finally {
      setIsSending(false);
    }
  }

  const displayResults =
    lastSendResults ??
    (sentLog?.length
      ? sentLog.slice(0, DEMO_RECIPIENTS.length).map((row) => ({
          recipientEmail: row.recipientEmail,
          recipientLabel: row.recipientLabel ?? row.recipientEmail,
          segment: row.segment as PersonaSegment,
          success: row.success,
          errorMessage: row.errorMessage ?? null,
          subject: row.subject,
        }))
      : null);

  return (
    <section id="send" className="w-full space-y-5">
      <SectionHeader
        step={5}
        title="Ship the winners"
        description="Send the best-performing variant for each segment to your opt-in test list."
      />

      {!showConfirm ? (
        <Button
          type="button"
          onClick={() => {
            setClientError(null);
            setShowConfirm(true);
          }}
          disabled={!canSend || rewrites === undefined}
        >
          Review & send
        </Button>
      ) : (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/80 p-5">
          <p className="text-sm font-medium text-amber-900">
            Confirm send — {DEMO_RECIPIENTS.length} emails will be delivered.
          </p>

          <div className="space-y-3">
            {previews.map((preview) => {
              const styles = SEGMENT_STYLES[preview.segment];
              return (
                <article
                  key={preview.email}
                  className={`rounded-lg border bg-cream-deep p-3 ${styles.border}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-stone-100">
                      {preview.label}
                    </p>
                    <span className={`text-xs font-medium ${styles.header}`}>
                      {SEGMENT_LABELS[preview.segment]}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-stone-500">{preview.email}</p>
                  <p className="mt-2 text-xs font-medium text-stone-400">
                    Subject: {preview.subject}
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-900/40 p-2 font-mono text-xs text-stone-200">
                    {preview.body || "(empty)"}
                  </pre>
                </article>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleConfirmSend}
              disabled={isSending || !canSend}
            >
              {isSending ? "Sending…" : "Confirm send"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowConfirm(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {clientError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {clientError}
        </p>
      ) : null}

      {displayResults ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Send log
          </h3>
          <ul className="space-y-2">
            {displayResults.map((row) => (
              <li
                key={`${row.recipientEmail}-${row.subject}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  row.success
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                <p className="font-medium">
                  {row.success ? "Sent" : "Failed"} — {row.recipientLabel}
                </p>
                <p className="font-mono text-xs opacity-80">{row.recipientEmail}</p>
                <p className="text-xs opacity-80">
                  {SEGMENT_LABELS[row.segment]} · {row.subject}
                </p>
                {row.errorMessage ? (
                  <p className="mt-1 text-xs">{row.errorMessage}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
