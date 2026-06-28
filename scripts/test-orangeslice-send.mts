import fs from "node:fs";
import path from "node:path";
import { sendOutreach } from "../lib/orangeslice.js";

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

console.log("Sending Wingman sandbox probe to kavyakavime@gmail.com…");

try {
  const result = await sendOutreach(
    "kavyakavime@gmail.com",
    "Wingman Hour 9 — Orange Slice send probe",
    "If you received this, Orange Slice outreach send is working from the Wingman sandbox test.",
    apiKey,
  );
  console.log("SUCCESS", JSON.stringify(result, null, 2));
} catch (error) {
  console.error("FAILED", error instanceof Error ? error.message : error);
  process.exit(2);
}
