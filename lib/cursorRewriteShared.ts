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

export const REWRITE_TIMEOUT_MS = 45_000;
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
      ? "They were mildly interested but unconvinced — sharpen proof, relevance, and specificity so a skeptical reader would reply."
      : sentiment === "positive"
        ? "They mostly liked it — remove remaining vague lines and make the value prop undeniable."
        : "They objected — rewrite must directly neutralize the cited concerns below, not generic polish.";

  const lines = [
    "You are an elite cold-outbound copywriter. Rewrite ONE complete email for a specific B2B segment.",
    "",
    `Target segment: ${SEGMENT_LABELS[segment]} — ${SEGMENT_DESCRIPTIONS[segment]}`,
    "",
    "Swarm simulation reactions from digital twins in this segment:",
    formatObjectionsBlock(objections),
    "",
    "Rewrite requirements:",
    `- ${sentimentGoal}`,
    "- Write a materially different email — new subject line, new opening hook, restructured body. Do NOT lightly edit the original.",
    "- Open by acknowledging the core objection or skepticism in natural language (one sentence).",
    "- Replace generic claims with concrete specificity: who it's for, what changes, why now.",
    "- Keep total length within ±25% of the original (similar number of paragraphs).",
    "- Preserve the sender voice and any factual product claims from the original — do not invent customers or metrics.",
    "- End with one clear, low-friction CTA.",
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

const REWRITE_SYSTEM_PROMPT = [
  "You rewrite cold outbound emails for B2B founders and executives.",
  "Return ONLY the finished email starting with Subject: on line 1.",
  "Every rewrite must meaningfully change the subject, opening, and argument — not synonym swaps.",
  "No commentary, no markdown fences.",
].join(" ");

export async function rewriteViaOpenAi(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: REWRITE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.55,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI rewrite failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI rewrite returned empty text");
  }

  return validateRewriteDraft(text);
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

  if (openaiApiKey) {
    try {
      console.log(`[rewriteForSegment] segment=${segment} path=openai attempting…`);
      const rewrittenDraft = await rewriteWithRetry(
        () =>
          withTimeout(
            rewriteViaOpenAi(prompt, openaiApiKey),
            REWRITE_TIMEOUT_MS,
            "OpenAI rewrite",
          ),
        segment,
      );
      console.log(
        `[rewriteForSegment] segment=${segment} path=openai success (${rewrittenDraft.length} chars)`,
      );
      return { rewrittenDraft, generatedVia: "openai_fallback" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[rewriteForSegment] segment=${segment} path=openai failed: ${message}`,
      );
      if (!cursorApiKey) {
        throw error instanceof Error ? error : new Error(message);
      }
    }
  }

  if (cursorApiKey) {
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
      throw new Error(
        `Rewrite failed for ${SEGMENT_LABELS[segment]}: ${message}`,
      );
    }
  }

  throw new Error(
    "Set OPENAI_API_KEY (recommended) or CURSOR_API_KEY in Convex env before generating rewrites.",
  );
}
