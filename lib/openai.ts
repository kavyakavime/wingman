/**
 * OpenAI GPT-4o — per-persona swarm reactions with structured JSON output.
 * @see https://platform.openai.com/docs/guides/structured-outputs
 */

import { shouldIgnoreRecentActivity } from "./lockedPersonas";
import type { PersonaSegment } from "./segments";
import { SEGMENT_DESCRIPTIONS, SEGMENT_LABELS } from "./segments";

export class OpenAiApiError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_api_key" | "unauthorized" | "api_error",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpenAiApiError";
  }
}

export type PersonaReactionSentiment = "positive" | "neutral" | "objecting";

export type PersonaReaction = {
  sentiment: PersonaReactionSentiment;
  reasoningText: string;
  citedSignal: string;
};

/** Lead fields consumed by the swarm reasoning prompt. */
export type PersonaReactionLead = {
  personName: string;
  role?: string;
  companyName?: string;
  /** Omitted for ad-hoc search leads without segment assignment. */
  segment?: PersonaSegment;
  painSignal?: string;
  socialSignal?: string;
  recentActivity?: string;
  activitySource?: string;
  fundingStage?: string;
  locality?: string;
};

const REACTION_JSON_SCHEMA = {
  name: "persona_reaction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "objecting"],
        description:
          "How this persona would react to receiving the draft cold email.",
      },
      reasoningText: {
        type: "string",
        description:
          "First-person reaction as the persona (2-4 sentences). Specific to their role, company, and cited signal.",
      },
      citedSignal: {
        type: "string",
        description:
          "Verbatim excerpt from an allowed profile field that drove this reaction. Must copy exact text from the context block.",
      },
    },
    required: ["sentiment", "reasoningText", "citedSignal"],
    additionalProperties: false,
  },
} as const;

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Fields the model may cite — excludes recentActivity when flagged unrelated. */
export function gatherCitableSignals(
  lead: PersonaReactionLead,
  ignoreRecentActivity: boolean,
): string[] {
  const signals: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    signals.push(trimmed);
    for (const part of trimmed.split(/[·|\n]+/)) {
      const chunk = part.trim();
      if (chunk.length >= 20) signals.push(chunk);
    }
  };

  add(lead.painSignal);
  add(lead.socialSignal);
  add(lead.role);
  add(lead.companyName);
  add(lead.fundingStage);
  add(lead.locality);
  if (!ignoreRecentActivity) add(lead.recentActivity);

  return [...new Set(signals)];
}

export function isCitedSignalGrounded(
  citedSignal: string,
  allowedSignals: string[],
): boolean {
  const cited = normalizeForMatch(citedSignal);
  if (cited.length < 12) return false;

  return allowedSignals.some((raw) => {
    const allowed = normalizeForMatch(raw);
    if (allowed.length < 12) return false;
    if (allowed.includes(cited) || cited.includes(allowed)) return true;
    // Allow a substantial prefix match when the model trims punctuation.
    const prefixLen = Math.min(60, allowed.length, cited.length);
    if (prefixLen >= 20 && allowed.slice(0, prefixLen) === cited.slice(0, prefixLen)) {
      return true;
    }
    return false;
  });
}

function buildPersonaContextBlock(
  lead: PersonaReactionLead,
  ignoreRecentActivity: boolean,
  citableSignals: string[],
): string {
  const lines: string[] = [
    `Name: ${lead.personName}`,
    lead.role ? `Role: ${lead.role}` : null,
    lead.companyName ? `Company: ${lead.companyName}` : null,
    lead.segment
      ? `Segment: ${SEGMENT_LABELS[lead.segment]} — ${SEGMENT_DESCRIPTIONS[lead.segment]}`
      : "Segment: not assigned (live audience search — no enrichment segment)",
    lead.locality ? `Location: ${lead.locality}` : null,
    lead.fundingStage ? `Funding stage: ${lead.fundingStage}` : null,
    lead.painSignal
      ? `Pain signal: ${lead.painSignal}`
      : "Pain signal: not available (no Orange Slice enrichment — do not invent one)",
    lead.socialSignal ? `Bio / headline: ${lead.socialSignal}` : null,
  ].filter(Boolean) as string[];

  if (ignoreRecentActivity) {
    lines.push(
      "",
      "DATA QUALITY NOTE: recentActivity for this persona is UNRELATED to their work (confirmed by review).",
      "Do NOT read, reference, or cite recentActivity. Ground your reaction ONLY in painSignal and bio/headline (socialSignal), plus role and company if needed.",
    );
  } else if (lead.recentActivity?.trim()) {
    lines.push(
      `Recent LinkedIn activity (${lead.activitySource ?? "unknown"}): ${lead.recentActivity.trim()}`,
    );
  } else {
    lines.push("Recent LinkedIn activity: none available.");
  }

  lines.push(
    "",
    "Allowed sources for citedSignal (copy verbatim from one of these):",
    ...citableSignals.map((s) => `- "${s}"`),
  );

  return lines.join("\n");
}

function buildSystemPrompt(ignoreRecentActivity: boolean, hasPainSignal: boolean): string {
  return [
    "You simulate how a specific B2B executive would react upon receiving a cold outbound email.",
    "Write reasoningText in first person as that executive — direct, specific, not marketing copy.",
    "Ground every reaction in the persona's real profile data. Do not invent facts, metrics, or priorities not present in the context.",
    "citedSignal MUST be a verbatim excerpt copied from one of the allowed sources listed in the context — not a paraphrase.",
    hasPainSignal
      ? "You may cite painSignal when it clearly explains your reaction."
      : "No painSignal is available — ground your reaction in bio/headline, role, company, or recent activity only. Do not invent a pain point.",
    ignoreRecentActivity
      ? "For this persona, recentActivity is explicitly marked unrelated — you must NOT reference or cite it."
      : "You may cite recentActivity only if it is specific and clearly relevant to why you react this way.",
    "Vary sentiment honestly: object if the pitch is generic or misaligned; be neutral if mildly interested but skeptical; positive only if the email clearly addresses your stated pain.",
  ].join(" ");
}

function buildUserPrompt(lead: PersonaReactionLead, draftMessage: string, contextBlock: string): string {
  return [
    "You are reacting to this cold email as the persona below.",
    "",
    "--- PERSONA CONTEXT ---",
    contextBlock,
    "--- END PERSONA CONTEXT ---",
    "",
    "--- DRAFT COLD EMAIL ---",
    draftMessage.trim(),
    "--- END DRAFT ---",
    "",
    `Respond as ${lead.personName}. Be specific to their role at ${lead.companyName ?? "their company"} and the signal you cite.`,
  ].join("\n");
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

async function callOpenAiStructured(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<PersonaReaction> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: REACTION_JSON_SCHEMA,
      },
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new OpenAiApiError(
      "Invalid OpenAI API key. Check OPENAI_API_KEY in Convex env.",
      "unauthorized",
      response.status,
    );
  }

  let body: ChatCompletionResponse;
  try {
    body = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new OpenAiApiError(
      `OpenAI returned non-JSON (HTTP ${response.status}).`,
      "api_error",
      response.status,
    );
  }

  if (!response.ok) {
    throw new OpenAiApiError(
      `OpenAI API error (HTTP ${response.status}): ${body.error?.message ?? response.statusText}`,
      "api_error",
      response.status,
    );
  }

  const raw = body.choices?.[0]?.message?.content;
  if (!raw) {
    throw new OpenAiApiError("OpenAI returned an empty completion.", "api_error");
  }

  let parsed: PersonaReaction;
  try {
    parsed = JSON.parse(raw) as PersonaReaction;
  } catch {
    throw new OpenAiApiError("OpenAI returned malformed JSON.", "api_error");
  }

  return parsed;
}

/**
 * Run one persona agent: given enriched lead data and a draft message,
 * return structured sentiment + first-person reasoning + grounded citation.
 */
export async function runPersonaReaction(
  lead: PersonaReactionLead,
  draftMessage: string,
  apiKey: string,
): Promise<PersonaReaction> {
  const trimmedDraft = draftMessage.trim();
  if (!trimmedDraft) {
    throw new OpenAiApiError("Draft message cannot be empty.", "api_error");
  }
  if (!apiKey.trim()) {
    throw new OpenAiApiError(
      "OPENAI_API_KEY is not configured. Set it with: npx convex env set OPENAI_API_KEY your_key",
      "missing_api_key",
    );
  }

  const ignoreRecentActivity = shouldIgnoreRecentActivity(lead.personName);
  const citableSignals = gatherCitableSignals(lead, ignoreRecentActivity);

  if (citableSignals.length === 0) {
    throw new OpenAiApiError(
      `No citable profile signals for ${lead.personName}. Need at least bio, role, company, or activity text.`,
      "api_error",
    );
  }

  const contextBlock = buildPersonaContextBlock(lead, ignoreRecentActivity, citableSignals);
  const systemPrompt = buildSystemPrompt(
    ignoreRecentActivity,
    Boolean(lead.painSignal?.trim()),
  );
  const userPrompt = buildUserPrompt(lead, trimmedDraft, contextBlock);

  let reaction = await callOpenAiStructured(apiKey, systemPrompt, userPrompt);

  if (!isCitedSignalGrounded(reaction.citedSignal, citableSignals)) {
    const retryPrompt = [
      userPrompt,
      "",
      "IMPORTANT: Your previous citedSignal was not a verbatim match from the allowed sources.",
      "Try again. citedSignal must copy exact text from one of the allowed bullet points above.",
    ].join("\n");
    reaction = await callOpenAiStructured(apiKey, systemPrompt, retryPrompt);
  }

  if (!isCitedSignalGrounded(reaction.citedSignal, citableSignals)) {
    throw new OpenAiApiError(
      `${lead.personName}: citedSignal not grounded in profile data: "${reaction.citedSignal.slice(0, 80)}…"`,
      "api_error",
    );
  }

  if (ignoreRecentActivity && lead.recentActivity?.trim()) {
    const recentNorm = normalizeForMatch(lead.recentActivity);
    const citedNorm = normalizeForMatch(reaction.citedSignal);
    if (recentNorm.includes(citedNorm) || citedNorm.includes(recentNorm.slice(0, 40))) {
      throw new OpenAiApiError(
        `${lead.personName}: cited recentActivity despite data-quality exclusion.`,
        "api_error",
      );
    }
  }

  return reaction;
}

export type PeerRound1Summary = {
  personName: string;
  sentiment: PersonaReactionSentiment;
  citedSignal: string;
};

export type OwnRound1Reaction = PersonaReaction;

function buildPeerSummaryBlock(peers: PeerRound1Summary[]): string {
  if (peers.length === 0) {
    return "No peer reactions available (solo run).";
  }
  return peers
    .map(
      (peer) =>
        `- ${peer.personName}: ${peer.sentiment} — "${peer.citedSignal.trim()}"`,
    )
    .join("\n");
}

function gatherRound2CitableSignals(
  lead: PersonaReactionLead,
  ignoreRecentActivity: boolean,
  ownRound1: OwnRound1Reaction,
  peers: PeerRound1Summary[],
): string[] {
  const signals = gatherCitableSignals(lead, ignoreRecentActivity);
  signals.push(ownRound1.citedSignal.trim());
  for (const peer of peers) {
    signals.push(peer.citedSignal.trim());
  }
  return [...new Set(signals.filter((s) => s.length >= 12))];
}

function buildPeerInfluenceSystemPrompt(): string {
  return [
    "You simulate how a specific B2B executive would react after seeing how their peers reacted to the same cold email.",
    "Write reasoningText in first person as that executive — direct, specific, not marketing copy.",
    "You already formed an initial reaction in round 1. Now you see a compact summary of other personas' sentiment and cited signal only.",
    "Decide whether peer reactions change your stance. If they do, update sentiment and reasoningText and cite what changed your mind.",
    "If peers do not change your stance, keep your original sentiment and explain why in reasoningText (you may reuse your original citedSignal).",
    "citedSignal MUST be a verbatim excerpt copied from one of the allowed sources — peer cited signals, your round-1 cited signal, or profile fields listed in context.",
    "Do not invent peer quotes or profile facts not present in the prompt.",
  ].join(" ");
}

function buildPeerInfluenceUserPrompt(
  lead: PersonaReactionLead,
  draftMessage: string,
  ownRound1: OwnRound1Reaction,
  peerSummaryBlock: string,
  citableSignals: string[],
): string {
  return [
    `You are ${lead.personName}. You already reacted to this cold email in round 1.`,
    "",
    "--- YOUR ROUND 1 REACTION ---",
    `Sentiment: ${ownRound1.sentiment}`,
    `Reasoning: ${ownRound1.reasoningText}`,
    `Cited signal: "${ownRound1.citedSignal}"`,
    "--- END ROUND 1 ---",
    "",
    "--- OTHER PERSONAS' ROUND 1 REACTIONS (sentiment + cited signal only) ---",
    peerSummaryBlock,
    "--- END PEER SUMMARY ---",
    "",
    "--- ORIGINAL DRAFT COLD EMAIL ---",
    draftMessage.trim(),
    "--- END DRAFT ---",
    "",
    "Does seeing how your peers reacted change your stance?",
    "If yes, update sentiment and reasoningText, citing what changed your mind.",
    "If not, keep your original sentiment and explain why peers did not move you.",
    "",
    "Allowed sources for citedSignal (copy verbatim from one of these):",
    ...citableSignals.map((s) => `- "${s}"`),
  ].join("\n");
}

/**
 * Round 2: re-evaluate after seeing peer round-1 sentiment + citedSignal summaries.
 */
export async function runPeerInfluenceReaction(
  lead: PersonaReactionLead,
  draftMessage: string,
  ownRound1: OwnRound1Reaction,
  peers: PeerRound1Summary[],
  apiKey: string,
): Promise<PersonaReaction> {
  const trimmedDraft = draftMessage.trim();
  if (!trimmedDraft) {
    throw new OpenAiApiError("Draft message cannot be empty.", "api_error");
  }
  if (!apiKey.trim()) {
    throw new OpenAiApiError(
      "OPENAI_API_KEY is not configured. Set it with: npx convex env set OPENAI_API_KEY your_key",
      "missing_api_key",
    );
  }

  const ignoreRecentActivity = shouldIgnoreRecentActivity(lead.personName);
  const citableSignals = gatherRound2CitableSignals(
    lead,
    ignoreRecentActivity,
    ownRound1,
    peers,
  );

  if (citableSignals.length === 0) {
    throw new OpenAiApiError(
      `No citable signals for round 2 (${lead.personName}).`,
      "api_error",
    );
  }

  const peerSummaryBlock = buildPeerSummaryBlock(peers);
  const systemPrompt = buildPeerInfluenceSystemPrompt();
  const userPrompt = buildPeerInfluenceUserPrompt(
    lead,
    trimmedDraft,
    ownRound1,
    peerSummaryBlock,
    citableSignals,
  );

  let reaction = await callOpenAiStructured(apiKey, systemPrompt, userPrompt);

  if (!isCitedSignalGrounded(reaction.citedSignal, citableSignals)) {
    const retryPrompt = [
      userPrompt,
      "",
      "IMPORTANT: Your previous citedSignal was not a verbatim match from the allowed sources.",
      "Try again. citedSignal must copy exact text from one of the allowed bullet points above.",
    ].join("\n");
    reaction = await callOpenAiStructured(apiKey, systemPrompt, retryPrompt);
  }

  if (!isCitedSignalGrounded(reaction.citedSignal, citableSignals)) {
    throw new OpenAiApiError(
      `${lead.personName} (round 2): citedSignal not grounded: "${reaction.citedSignal.slice(0, 80)}…"`,
      "api_error",
    );
  }

  return reaction;
}
