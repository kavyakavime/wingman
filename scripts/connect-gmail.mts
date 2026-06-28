import fs from "node:fs";
import path from "node:path";
import { integrations, withApiKey } from "orangeslice";

const configPath = path.join(
  process.env.HOME ?? "",
  ".config/orangeslice/config.json",
);
const apiKey =
  process.env.ORANGESLICE_API_KEY ??
  (fs.existsSync(configPath)
    ? (JSON.parse(fs.readFileSync(configPath, "utf8")).apiKey as string)
    : undefined);

if (!apiKey) {
  console.error("No ORANGESLICE_API_KEY in env or ~/.config/orangeslice/config.json");
  process.exit(1);
}

console.log("Opening Orange Slice Gmail OAuth flow in your browser…");
console.log("(Gmail is OAuth-only — do not use dashboard \"+ Add Key\".)\n");

await withApiKey(apiKey, async () => {
  const { integrations: existing } = await integrations.list({ provider: "gmail" });
  for (const row of existing) {
    if (!row.hasOauthToken) {
      console.log(`Removing stale Gmail integration ${row.id} (hasOauthToken=false)…`);
      await integrations.delete(row.id);
    }
  }

  const integration = await integrations.connect("gmail");
  console.log("\nConnected:", JSON.stringify(integration, null, 2));

  const { integrations: rows } = await integrations.list({ provider: "gmail" });
  console.log("\nGmail integrations after connect:");
  console.log(JSON.stringify(rows, null, 2));
});
