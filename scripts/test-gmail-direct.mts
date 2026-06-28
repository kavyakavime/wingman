/**
 * Test direct Gmail SMTP send (bypasses Orange Slice).
 *
 * Requires:
 *   export GMAIL_USER=kavyakavime@gmail.com
 *   export GMAIL_APP_PASSWORD='your 16-char app password'
 *
 * Or set those in Convex env and run via `npx convex run`.
 */
import { sendViaGmailDirect } from "../lib/gmailDirect.js";

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;

if (!user || !pass) {
  console.error(`
GMAIL_USER and GMAIL_APP_PASSWORD are not set.

1. Google Account → Security → 2-Step Verification → App passwords
2. Create app password for "Mail" / "Wingman"
3. export GMAIL_USER=kavyakavime@gmail.com
4. export GMAIL_APP_PASSWORD='xxxx xxxx xxxx xxxx'
5. npx convex env set GMAIL_USER kavyakavime@gmail.com
6. npx convex env set GMAIL_APP_PASSWORD 'xxxx xxxx xxxx xxxx'
`);
  process.exit(1);
}

console.log(`Sending direct Gmail probe from ${user}…`);

try {
  const result = await sendViaGmailDirect(
    "kavyakavime@gmail.com",
    "Wingman — direct Gmail probe",
    "If you received this, direct Gmail SMTP send is working.",
  );
  console.log("SUCCESS", result);
} catch (error) {
  console.error("FAILED", error instanceof Error ? error.message : error);
  process.exit(2);
}
