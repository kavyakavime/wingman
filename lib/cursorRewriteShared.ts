/**
 * Shared rewrite prompt + OpenAI fallback (Convex-safe — no @cursor/sdk import).
 */

import { parseRewriteDraft } from "./parseRewriteDraft";
import type { PersonaSegment } from "./segments";
import { SEGMENT_DESCRIPTIONS, SEGMENT_LABELS } from "./segments";
import type { SwarmSentiment } from "./swarmGraphData";
import type { SegmentObjection } from "./scoreCard";

export type RewriteGeneratedVia = "cursor_sdk" | "openai_fallback";

export type RewriteForSegmentResult = {
  rewrittenDraft: string;
  generatedVia: RewriteGeneratedVia;
};

export const REWRITE_TIMEOUT_MS = 90_000;
/** Cloud agents (SDK or REST) often need longer than a single GPT-4o call. */
export const CURSOR_REWRITE_TIMEOUT_MS = 60_000;

function formatObjectionsBlock(objections: SegmentObjection[]): string {
  if (objections.length === 0) {
    return "(No detailed reactions recorded — still tailor copy to this segment's typical buying concerns.)";
  }

  return objections
    .map((objection, index) => {
      const lines = [
        `${index + 1}. ${objection.personName} (${objection.sentiment})`,
      ];
      if (objection.reasoningText) {
        lines.push(`   Reaction: "${objection.reasoningText}"`);
      }
      if (objection.citedSignal) {
        lines.push(`   Cited signal: "${objection.citedSignal}"`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildRewritePrompt(
  segment: PersonaSegment,
  topSignals: string[],
  originalDraft: string,
  options?: {
    extraInstructions?: string;
    dominantSentiment?: SwarmSentiment | null;
    objections?: SegmentObjection[];
  },
): string {
  const sentiment = options?.dominantSentiment ?? "objecting";
  const objections = options?.objections ?? topSignals.map((signal) => ({
    personName: "Persona",
    sentiment,
    citedSignal: signal,
    reasoningText: "",
  }));

  const sentimentGoal =
    sentiment === "neutral"
      ? "They were mildly interested but unconvinced — add sharper proof and specificity so a skeptical reader would reply, without sounding like you're 'handling objections'."
      : sentiment === "positive"
        ? "They mostly liked it — tighten vague lines and make the value prop undeniable; do not add performative empathy."
        : "They objected — address cited concerns through relevance and proof woven into the body, not by leading with their pain points.";

  const lines = [
    "You are an elite cold-outbound copywriter. Rewrite ONE complete email for a specific B2B segment.",
    "",
    `Target segment: ${SEGMENT_LABELS[segment]} — ${SEGMENT_DESCRIPTIONS[segment]}`,
    `Segment tone: ${SEGMENT_COPY_GUIDANCE[segment]}`,
    "",
    "Swarm simulation reactions from digital twins in this segment:",
    formatObjectionsBlock(objections),
    "",
    "Rewrite requirements:",
    `- ${sentimentGoal}`,
    "- Write a materially different email — new subject line, new opening hook, restructured body. Do NOT lightly edit the original.",
    "- Tone: thoughtful peer, not a sales bot doing objection handling.",
    "- Opening paragraph: lead with a specific, relevant hook (insight, outcome, or context) — NOT a pain inventory and NOT meta-commentary on their skepticism.",
    "- Middle paragraphs: weave swarm concerns in subtly via proof, examples, and product fit — show you understand their world without naming every problem upfront.",
    "- Replace generic claims with concrete specificity: who it's for, what changes, why now.",
    "- Keep total length within ±25% of the original (similar number of paragraphs).",
    "- Preserve the sender voice and any factual product claims from the original — do not invent customers or metrics.",
    "- End with one clear, low-friction CTA.",
    "",
    "Banned openings (never use these patterns):",
    '- "I get why..." / "I know you\'re juggling..." / "I see why a generic..."',
    '- "No [vendor/data pitch] solves those head-on" / "feels off-target when you\'re..."',
    '- Leading sentence that lists 2+ of their pain points before stating value',
    '- Explicitly naming that they objected, seemed skeptical, or received a generic pitch',
    "",
    "Opening examples:",
    '- Good: "Teams shipping humanoids into pilot often need behaviour data that holds up in sim-to-real before fleet scale — that\'s the gap we built for."',
    '- Bad: "I get why a generic dataset pitch feels off-target when you\'re juggling prototype timelines and safety validation."',
    "",
    "Output format (strict):",
    'First line MUST be `Subject: Your subject here`',
    "Then a blank line",
    "Then the email body (greeting, paragraphs, sign-off)",
    "No preamble, no markdown fences, no bullet list of edits.",
  ];

  if (options?.extraInstructions?.trim()) {
    lines.push("", "Additional instructions:", options.extraInstructions.trim());
  }

  lines.push(
    "",
    "--- ORIGINAL DRAFT ---",
    originalDraft.trim(),
    "--- END ORIGINAL DRAFT ---",
  );

  return lines.join("\n");
}

export function sanitizeRewriteOutput(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:[\w-]+)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  cleaned = cleaned.trim();

  if (!/^Subject:/im.test(cleaned)) {
    const firstLine = cleaned.split("\n")[0]?.trim() ?? "";
    if (firstLine.length > 0 && firstLine.length < 120) {
      cleaned = `Subject: ${firstLine.replace(/^Subject:\s*/i, "")}\n\n${cleaned.slice(firstLine.length).trim()}`;
    }
  }

  return cleaned.trim();
}

export function validateRewriteDraft(text: string): string {
  const sanitized = sanitizeRewriteOutput(text);
  parseRewriteDraft(sanitized);
  return sanitized;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

const SEGMENT_COPY_GUIDANCE: Record<PersonaSegment, string> = {
  scaled:
    "Enterprise tone: open with operational or deployment context, then proof this fits an established operator — not startup hype or pain callouts.",
  early_stage:
    "Founder tone: open with a concrete outcome or workflow insight; let time pressure and scrappiness show through brevity and specificity, not by listing their stresses.",
  vertical_specialist:
    "Domain-expert tone: open with niche-specific language that signals fluency; constraints should feel implied, not recited.",
};

const REWRITE_SYSTEM_PROMPT = [
  "You are an elite B2B cold-outbound copywriter.",
  "You rewrite emails so they feel personally relevant to a segment — through proof and specificity, not performative empathy.",
  "Every rewrite must change the subject line, opening hook, and core argument — never synonym swaps or light edits.",
  "Never open by acknowledging objections, skepticism, or pain lists. Earn attention first; align subtly later.",
  "Preserve factual claims from the original; do not invent customers, metrics, or funding rounds.",
].join(" ");

function formatDraftFromParts(subject: string, body: string): string {
  return `Subject: ${subject.trim()}\n\n${body.trim()}`;
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Reject rewrites that barely changed the original. */
export function rewriteDiffersEnough(originalDraft: string, rewrittenDraft: string): boolean {
  try {
    const original = parseRewriteDraft(originalDraft);
    const rewritten = parseRewriteDraft(rewrittenDraft);
    if (normalizeForCompare(original.subject) === normalizeForCompare(rewritten.subject)) {
      return false;
    }
    const origWords = new Set(normalizeForCompare(original.body).split(" ").filter(Boolean));
    const revWords = normalizeForCompare(rewritten.body).split(" ").filter(Boolean);
    if (revWords.length === 0) return false;
    const overlap = revWords.filter((w) => origWords.has(w)).length / revWords.length;
    return overlap < 0.72;
  } catch {
    return true;
  }
}

async function openAiChat(
  apiKey: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  options?: { temperature?: number; jsonSchema?: object },
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "gpt-4o",
    messages,
    temperature: options?.temperature ?? 0.45,
  };

  if (options?.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "email_rewrite",
        strict: true,
        schema: options.jsonSchema,
      },
    };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI rewrite failed (${response.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI rewrite returned empty text");
  }
  return text;
}

export async function rewriteViaOpenAi(
  prompt: string,
  apiKey: string,
  context?: {
    segment: PersonaSegment;
    originalDraft: string;
    objections?: SegmentObjection[];
    dominantSentiment?: SwarmSentiment | null;
  },
): Promise<string> {
  const segment = context?.segment;
  const originalDraft = context?.originalDraft?.trim() ?? "";
  const objections = context?.objections ?? [];
  const dominantSentiment = context?.dominantSentiment ?? "objecting";

  const userPrompt = [
    prompt,
    segment ? `\nSegment copy guidance: ${SEGMENT_COPY_GUIDANCE[segment]}` : "",
    objections.length > 0
      ? `\nAddress these swarm concerns subtly in the body (woven into proof, not announced in the opening):\n${objections
          .slice(0, 4)
          .map(
            (o, i) =>
              `${i + 1}. ${o.personName}: "${o.reasoningText || o.citedSignal}"`,
          )
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const draftJson = await openAiChat(
    apiKey,
    [
      { role: "system", content: REWRITE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    {
      temperature: 0.5,
      jsonSchema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
          openingHook: {
            type: "string",
            description:
              "The opening hook: one sentence that earns attention without naming pain or skepticism",
          },
        },
        required: ["subject", "body", "openingHook"],
        additionalProperties: false,
      },
    },
  );

  const parsed = JSON.parse(draftJson) as { subject?: string; body?: string };
  if (!parsed.subject?.trim() || !parsed.body?.trim()) {
    throw new Error("OpenAI rewrite returned incomplete subject/body");
  }

  let draft = formatDraftFromParts(parsed.subject, parsed.body);
  draft = validateRewriteDraft(draft);

  if (originalDraft && !rewriteDiffersEnough(originalDraft, draft)) {
    const stricter = await openAiChat(
      apiKey,
      [
        { role: "system", content: REWRITE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${userPrompt}

Your prior draft was too similar to the original. Write a NEW email with a different subject, a different opening sentence, and a restructured argument. Dominant swarm sentiment: ${dominantSentiment}.`,
        },
      ],
      {
        temperature: 0.65,
        jsonSchema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
          additionalProperties: false,
        },
      },
    );
    const retry = JSON.parse(stricter) as { subject?: string; body?: string };
    if (retry.subject?.trim() && retry.body?.trim()) {
      draft = validateRewriteDraft(formatDraftFromParts(retry.subject, retry.body));
    }
  }

  if (objections.length > 0) {
    const refinedJson = await openAiChat(
      apiKey,
      [
        {
          role: "system",
          content:
            "You polish cold emails. Keep subject and length similar. Improve flow and subtle relevance — weave objection themes into proof, never into a front-loaded pain paragraph. No 'I get why' openings.",
        },
        {
          role: "user",
          content: `Polish this rewrite. Swarm themes should feel natural in the body, not announced in sentence one.

Themes to weave subtly (do not list these in the opening):
${objections
  .slice(0, 4)
  .map((o) => `- ${o.personName}: ${o.reasoningText || o.citedSignal}`)
  .join("\n")}

Email:
${draft}`,
        },
      ],
      {
        temperature: 0.35,
        jsonSchema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
          additionalProperties: false,
        },
      },
    );
    const refined = JSON.parse(refinedJson) as { subject?: string; body?: string };
    if (refined.subject?.trim() && refined.body?.trim()) {
      draft = validateRewriteDraft(formatDraftFromParts(refined.subject, refined.body));
    }
  }

  return draft;
}

async function rewriteWithRetry(
  run: () => Promise<string>,
  segment: PersonaSegment,
): Promise<string> {
  try {
    return await run();
  } catch (firstError) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(
      `[rewriteForSegment] segment=${segment} first attempt failed: ${message} — retrying once`,
    );
    return run();
  }
}

export async function rewriteForSegmentWithCursorFn(
  segment: PersonaSegment,
  topSignals: string[],
  originalDraft: string,
  cursorRewriteFn: (prompt: string, apiKey: string) => Promise<string>,
  options?: {
    cursorApiKey?: string;
    openaiApiKey?: string;
    extraInstructions?: string;
    dominantSentiment?: SwarmSentiment | null;
    objections?: SegmentObjection[];
  },
): Promise<RewriteForSegmentResult> {
  const draft = originalDraft.trim();
  if (!draft) {
    throw new Error("Original draft cannot be empty.");
  }

  const prompt = buildRewritePrompt(segment, topSignals, draft, {
    extraInstructions: options?.extraInstructions,
    dominantSentiment: options?.dominantSentiment,
    objections: options?.objections,
  });
  const cursorApiKey = options?.cursorApiKey ?? process.env.CURSOR_API_KEY;
  const openaiApiKey = options?.openaiApiKey ?? process.env.OPENAI_API_KEY;
  const openAiContext = {
    segment,
    originalDraft: draft,
    objections: options?.objections,
    dominantSentiment: options?.dominantSentiment,
  };

  if (!cursorApiKey) {
    throw new Error(
      "CURSOR_API_KEY is not configured. Rewrites use Cursor SDK by default; set it with: npx convex env set CURSOR_API_KEY your_key",
    );
  }

  try {
    console.log(`[rewriteForSegment] segment=${segment} path=cursor_sdk attempting…`);
    const raw = await withTimeout(
      cursorRewriteFn(prompt, cursorApiKey),
      CURSOR_REWRITE_TIMEOUT_MS,
      "Cursor rewrite",
    );
    const rewrittenDraft = await rewriteWithRetry(
      () => Promise.resolve(validateRewriteDraft(raw)),
      segment,
    );
    console.log(
      `[rewriteForSegment] segment=${segment} path=cursor_sdk success (${rewrittenDraft.length} chars)`,
    );
    return { rewrittenDraft, generatedVia: "cursor_sdk" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[rewriteForSegment] segment=${segment} path=cursor_sdk failed: ${message}`,
    );

    if (!openaiApiKey) {
      throw new Error(
        `Cursor rewrite failed for ${SEGMENT_LABELS[segment]} and OPENAI_API_KEY is not set for fallback: ${message}`,
      );
    }

    try {
      console.log(`[rewriteForSegment] segment=${segment} path=openai_fallback attempting…`);
      const rewrittenDraft = await rewriteWithRetry(
        () =>
          withTimeout(
            rewriteViaOpenAi(prompt, openaiApiKey, openAiContext),
            REWRITE_TIMEOUT_MS,
            "OpenAI rewrite",
          ),
        segment,
      );
      console.log(
        `[rewriteForSegment] segment=${segment} path=openai_fallback success (${rewrittenDraft.length} chars)`,
      );
      return { rewrittenDraft, generatedVia: "openai_fallback" };
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(
        `Rewrite failed for ${SEGMENT_LABELS[segment]} (Cursor: ${message}; OpenAI fallback: ${fallbackMessage})`,
      );
    }
  }
}
