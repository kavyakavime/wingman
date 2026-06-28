/**
 * Shared rewrite prompt + OpenAI fallback (Convex-safe — no @cursor/sdk import).
 */

import type { PersonaSegment } from "./segments";
import { SEGMENT_LABELS } from "./segments";

export type RewriteGeneratedVia = "cursor_sdk" | "openai_fallback";

export type RewriteForSegmentResult = {
  rewrittenDraft: string;
  generatedVia: RewriteGeneratedVia;
};

export const REWRITE_TIMEOUT_MS = 15_000;
/** Cloud agents (SDK or REST) often need longer than a single GPT-4o call. */
export const CURSOR_REWRITE_TIMEOUT_MS = 60_000;

export function buildRewritePrompt(
  segment: PersonaSegment,
  topSignals: string[],
  originalDraft: string,
  options?: { extraInstructions?: string },
): string {
  const objections = topSignals
    .map((signal, i) => `${i + 1}. "${signal}"`)
    .join("\n");

  const lines = [
    "You are rewriting a cold outbound email draft for a specific audience segment.",
    "",
    `Target segment: ${SEGMENT_LABELS[segment]}`,
    "",
    "The swarm test surfaced these specific objections / cited pain signals from personas in this segment:",
    objections || "(none recorded — still tailor to this segment's typical concerns)",
    "",
    "Rewrite the draft below into ONE variant that:",
    "- Directly acknowledges and addresses the cited objection(s) above — not generic improvements",
    "- References the real cited pain in natural language (do not quote the objection labels verbatim as a list)",
    "- Keeps the same overall length, tone, and structure as the original (subject line, greeting, sign-off)",
    "- Stays a single cohesive email — no meta commentary, no bullet list of changes",
  ];

  if (options?.extraInstructions?.trim()) {
    lines.push("", "Additional instructions for this rewrite:", options.extraInstructions.trim());
  }

  lines.push(
    "",
    "Return ONLY the rewritten email text. No preamble, no markdown fences.",
    "",
    "--- ORIGINAL DRAFT ---",
    originalDraft.trim(),
    "--- END ORIGINAL DRAFT ---",
  );

  return lines.join("\n");
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
        {
          role: "system",
          content:
            "You rewrite cold outbound emails. Return only the rewritten email — no commentary.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI fallback failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI fallback returned empty rewrite");
  }

  return text;
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
  },
): Promise<RewriteForSegmentResult> {
  const draft = originalDraft.trim();
  if (!draft) {
    throw new Error("Original draft cannot be empty.");
  }

  const prompt = buildRewritePrompt(segment, topSignals, draft, {
    extraInstructions: options?.extraInstructions,
  });
  const cursorApiKey = options?.cursorApiKey ?? process.env.CURSOR_API_KEY;
  const openaiApiKey = options?.openaiApiKey ?? process.env.OPENAI_API_KEY;

  if (cursorApiKey) {
    try {
      console.log(
        `[rewriteForSegment] segment=${segment} path=cursor_sdk attempting…`,
      );
      const rewrittenDraft = await withTimeout(
        cursorRewriteFn(prompt, cursorApiKey),
        CURSOR_REWRITE_TIMEOUT_MS,
        "Cursor rewrite",
      );
      console.log(
        `[rewriteForSegment] segment=${segment} path=cursor_sdk success (${rewrittenDraft.length} chars)`,
      );
      return { rewrittenDraft, generatedVia: "cursor_sdk" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[rewriteForSegment] segment=${segment} path=cursor_sdk failed: ${message} — falling back to OpenAI`,
      );
    }
  } else {
    console.warn(
      `[rewriteForSegment] segment=${segment} CURSOR_API_KEY missing — skipping Cursor SDK`,
    );
  }

  if (!openaiApiKey) {
    throw new Error(
      "Neither Cursor SDK nor OpenAI fallback available (set CURSOR_API_KEY or OPENAI_API_KEY).",
    );
  }

  console.log(
    `[rewriteForSegment] segment=${segment} path=openai_fallback attempting…`,
  );
  const rewrittenDraft = await withTimeout(
    rewriteViaOpenAi(prompt, openaiApiKey),
    REWRITE_TIMEOUT_MS,
    "OpenAI fallback rewrite",
  );
  console.log(
    `[rewriteForSegment] segment=${segment} path=openai_fallback success (${rewrittenDraft.length} chars)`,
  );

  return { rewrittenDraft, generatedVia: "openai_fallback" };
}
