import type { FiberActivitySource } from "./fiber";

/** Human-readable Fiber signal type for spreadsheet labels. */
export function fiberSignalLabel(
  kind: string | null | undefined,
  source: FiberActivitySource | null | undefined,
): string {
  if (kind?.trim()) {
    const name = kind.trim().replace(/_/g, " ");
    return source === "posts" ? `LinkedIn ${name}` : `LinkedIn ${name}`;
  }
  if (source === "posts") return "LinkedIn post";
  if (source === "latest_activities") return "LinkedIn activity";
  return "No signal";
}

/** Drop the `[type] (date):` prefix Fiber adds — the label carries the type. */
export function fiberSignalBody(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^\[[^\]]+\](?:\s*\([^)]+\))?:\s*/, "").trim();
  return stripped || trimmed;
}

export function parseFiberSignalPrefix(text: string | null | undefined): {
  kind: string | null;
  source: FiberActivitySource | null;
} {
  const match = text?.trim().match(/^\[([^\]]+)\]/);
  if (!match) return { kind: null, source: null };
  const kind = match[1]?.trim() ?? null;
  if (!kind) return { kind: null, source: null };
  const source: FiberActivitySource = kind === "post" ? "posts" : "latest_activities";
  return { kind, source };
}
