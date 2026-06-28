/**
 * Direct Gmail send via SMTP + app password.
 *
 * Fallback when Orange Slice's Composio Gmail bridge is unavailable.
 * Create an app password: Google Account → Security → 2-Step Verification → App passwords.
 *
 * Set in Convex env:
 *   GMAIL_USER=kavyakavime@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 */

import nodemailer from "nodemailer";

export class GmailDirectError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_credentials" | "send_failed",
  ) {
    super(message);
    this.name = "GmailDirectError";
  }
}

export function gmailDirectConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim(),
  );
}

export async function sendViaGmailDirect(
  toEmail: string,
  subject: string,
  body: string,
): Promise<{ messageId: string }> {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !pass) {
    throw new GmailDirectError(
      "GMAIL_USER and GMAIL_APP_PASSWORD are not set in Convex env. " +
        "Create a Google app password and run: npx convex env set GMAIL_USER you@gmail.com && npx convex env set GMAIL_APP_PASSWORD 'xxxx xxxx xxxx xxxx'",
      "missing_credentials",
    );
  }

  const to = toEmail.trim();
  if (!to.includes("@")) {
    throw new GmailDirectError(`Invalid recipient: "${toEmail}"`, "send_failed");
  }

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  try {
    const info = await transport.sendMail({
      from: user,
      to,
      subject: subject.trim(),
      text: body.trim(),
    });

    const messageId =
      typeof info.messageId === "string" ? info.messageId : String(info.response ?? "sent");
    return { messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GmailDirectError(`Gmail SMTP send failed: ${message}`, "send_failed");
  }
}
