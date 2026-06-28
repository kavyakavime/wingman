import { query } from "./_generated/server";

/** Public send settings for the one-click send modal (no secrets). */
export const getSendConfig = query({
  args: {},
  handler: async () => {
    const fromEmail = process.env.GMAIL_USER?.trim() ?? null;
    const smtpConfigured = Boolean(
      fromEmail && process.env.GMAIL_APP_PASSWORD?.trim(),
    );
    return { fromEmail, smtpConfigured };
  },
});
