import fs from "node:fs";
import path from "node:path";
import { withApiKey } from "orangeslice";
import { post } from "orangeslice/dist/api";

const configPath = path.join(process.env.HOME ?? "", ".config/orangeslice/config.json");
const apiKey =
  process.env.ORANGESLICE_API_KEY ??
  (fs.existsSync(configPath)
    ? (JSON.parse(fs.readFileSync(configPath, "utf8")).apiKey as string)
    : undefined);

if (!apiKey) {
  console.error("No ORANGESLICE_API_KEY");
  process.exit(1);
}

const to = "kavyakavime@gmail.com";

await withApiKey(apiKey, async () => {
  console.log("1) POST /execute/email (managed sender)…");
  try {
    const result = (await post("/execute/email", {
      to,
      subject: "Wingman — managed email probe",
      html: "<p>Managed /execute/email path test</p>",
    })) as { id?: string; messageId?: string };
    console.log("   OK", JSON.stringify(result));
  } catch (error) {
    console.error("   FAIL", error instanceof Error ? error.message : error);
  }

  console.log("2) POST /execute/integration (Gmail via Composio)…");
  try {
    const result = (await post("/execute/integration", {
      provider: "gmail",
      method: "sendEmail",
      args: [
        {
          recipient_email: to,
          subject: "Wingman — Gmail integration probe",
          body: "Gmail integration path test",
          is_html: false,
        },
      ],
    })) as { successful?: boolean; error?: string; data?: unknown };
    console.log("   OK", JSON.stringify(result));
  } catch (error) {
    console.error("   FAIL", error instanceof Error ? error.message : error);
  }
});
