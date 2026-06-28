import { query } from "./_generated/server";
import { formatLobAddressOneLine, lobConfigured, parseLobFromAddress } from "../lib/lobDirect";

/** Public send settings for the one-click send modal (no secrets). */
export const getSendConfig = query({
  args: {},
  handler: async () => {
    const fromEmail = process.env.GMAIL_USER?.trim() ?? null;
    const smtpConfigured = Boolean(
      fromEmail && process.env.GMAIL_APP_PASSWORD?.trim(),
    );

    let lobFromAddress: string | null = null;
    if (lobConfigured()) {
      try {
        lobFromAddress = formatLobAddressOneLine(parseLobFromAddress());
      } catch {
        lobFromAddress = "Lob return address (check LOB_FROM_ADDRESS JSON)";
      }
    }

    return {
      fromEmail,
      smtpConfigured,
      lobConfigured: lobConfigured(),
      lobFromAddress,
    };
  },
});
