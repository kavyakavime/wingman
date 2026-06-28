import { inferLeadSegment } from "./inferSegment";
import { parseRewriteDraft } from "./parseRewriteDraft";
import type { PersonaSegment } from "./segments";

export type LeadEmailSource = "rewrite" | "simulation";

export type ResolvedLeadEmail = {
  subject: string;
  body: string;
  source: LeadEmailSource;
  segment: PersonaSegment;
};

function tryParseDraft(draft: string): { subject: string; body: string } | null {
  try {
    return parseRewriteDraft(draft);
  } catch {
    return null;
  }
}

/** Pick rewrite for segment, else fall back to the simulation draft. */
export function resolveLeadEmailContent(
  lead: {
    _id: string;
    personName?: string | null;
    role?: string | null;
    segment?: PersonaSegment | null;
  },
  rewriteBySegment: Map<PersonaSegment, string>,
  simulationDraft: string,
): ResolvedLeadEmail {
  const segment = inferLeadSegment({
    _id: lead._id,
    personName: lead.personName,
    role: lead.role,
    segment: lead.segment,
  });

  const rewrite = rewriteBySegment.get(segment)?.trim();
  if (rewrite) {
    const parsed = tryParseDraft(rewrite);
    if (parsed) {
      return { ...parsed, source: "rewrite", segment };
    }
  }

  const draft = simulationDraft.trim();
  if (draft) {
    const parsed = tryParseDraft(draft);
    if (parsed) {
      return { ...parsed, source: "simulation", segment };
    }
    return {
      subject: "Quick note",
      body: draft,
      source: "simulation",
      segment,
    };
  }

  return {
    subject: "Quick note",
    body: "",
    source: "simulation",
    segment,
  };
}

/** Full email text for the popup editor (Subject + body). */
export function formatEmailEditorValue(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body}`;
}

export function parseEmailEditorValue(text: string): { subject: string; body: string } {
  const parsed = tryParseDraft(text.trim());
  if (parsed) return parsed;
  const trimmed = text.trim();
  if (!trimmed) {
    return { subject: "Quick note", body: "" };
  }
  return { subject: "Quick note", body: trimmed };
}
