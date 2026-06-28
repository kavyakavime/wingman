/**
 * Direct Lob Print & Mail — physical letters.
 *
 * Set in Convex env:
 *   LOB_API_KEY=test_... or live_...
 *   LOB_FROM_ADDRESS='{"name":"...","address_line1":"...","address_city":"...","address_state":"CA","address_zip":"94107"}'
 */

import { plainTextToHtml } from "./parseRewriteDraft";

export type LobAddress = {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
};

export class LobDirectError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_credentials" | "invalid_address" | "send_failed",
  ) {
    super(message);
    this.name = "LobDirectError";
  }
}

export function lobConfigured(): boolean {
  return Boolean(
    process.env.LOB_API_KEY?.trim() && process.env.LOB_FROM_ADDRESS?.trim(),
  );
}

export function parseLobFromAddress(): LobAddress {
  const raw = process.env.LOB_FROM_ADDRESS?.trim();
  if (!raw) {
    throw new LobDirectError(
      "LOB_FROM_ADDRESS is not set in Convex env.",
      "missing_credentials",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LobDirectError(
      "LOB_FROM_ADDRESS must be valid JSON with name, address_line1, address_city, address_state, address_zip.",
      "invalid_address",
    );
  }

  const addr = parsed as Record<string, unknown>;
  const name = String(addr.name ?? "").trim();
  const address_line1 = String(addr.address_line1 ?? "").trim();
  const address_city = String(addr.address_city ?? "").trim();
  const address_state = String(addr.address_state ?? "").trim().toUpperCase();
  const address_zip = String(addr.address_zip ?? "").trim();
  const address_line2 = addr.address_line2
    ? String(addr.address_line2).trim()
    : undefined;

  if (!name || !address_line1 || !address_city || !address_state || !address_zip) {
    throw new LobDirectError(
      "LOB_FROM_ADDRESS is missing required fields (name, address_line1, address_city, address_state, address_zip).",
      "invalid_address",
    );
  }

  return {
    name,
    address_line1,
    address_line2: address_line2 || undefined,
    address_city,
    address_state,
    address_zip,
  };
}

export function formatLobAddressOneLine(addr: LobAddress): string {
  const line2 = addr.address_line2 ? `, ${addr.address_line2}` : "";
  return `${addr.name} · ${addr.address_line1}${line2}, ${addr.address_city}, ${addr.address_state} ${addr.address_zip}`;
}

function validateToAddress(to: LobAddress): void {
  if (!to.name.trim()) {
    throw new LobDirectError("Recipient name is required.", "invalid_address");
  }
  if (!to.address_line1.trim()) {
    throw new LobDirectError("Street address is required.", "invalid_address");
  }
  if (!to.address_city.trim() || !to.address_state.trim() || !to.address_zip.trim()) {
    throw new LobDirectError("City, state, and ZIP are required.", "invalid_address");
  }
}

function letterHtml(subject: string, body: string): string {
  const subjectHtml = subject
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<html><body style="font-family: Georgia, serif; font-size: 12pt; line-height: 1.5; color: #111;"><h2 style="font-size: 14pt; margin-bottom: 1em;">${subjectHtml}</h2>${plainTextToHtml(body)}</body></html>`;
}

export async function sendViaLob(args: {
  to: LobAddress;
  subject: string;
  body: string;
  description?: string;
}): Promise<{ letterId: string }> {
  const apiKey = process.env.LOB_API_KEY?.trim();
  if (!apiKey) {
    throw new LobDirectError(
      "LOB_API_KEY is not set in Convex env.",
      "missing_credentials",
    );
  }

  const from = parseLobFromAddress();
  const to = { ...args.to };
  validateToAddress(to);

  const subject = args.subject.trim();
  const body = args.body.trim();
  if (!subject) {
    throw new LobDirectError("Letter subject cannot be empty.", "send_failed");
  }
  if (!body) {
    throw new LobDirectError("Letter body cannot be empty.", "send_failed");
  }

  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const response = await fetch("https://api.lob.com/v1/letters", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: args.description ?? "Wingman physical mail outreach",
      to,
      from,
      color: false,
      file: letterHtml(subject, body),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    const detail = payload.error?.message ?? response.statusText;
    throw new LobDirectError(`Lob letter send failed: ${detail}`, "send_failed");
  }

  if (!payload.id) {
    throw new LobDirectError("Lob returned no letter id.", "send_failed");
  }

  return { letterId: payload.id };
}
