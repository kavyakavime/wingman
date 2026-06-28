/**
 * Cursor Cloud Agents REST API — used from Convex actions where @cursor/sdk
 * cannot bundle. Same backend as Agent.create({ cloud: {} }).
 */

const CURSOR_API_BASE = "https://api.cursor.com";

type CreateAgentResponse = {
  agent?: { id?: string };
  run?: { id?: string; status?: string; result?: string };
};

type RunResponse = {
  status?: string;
  result?: string;
};

function basicAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

async function pollRunResult(
  apiKey: string,
  agentId: string,
  runId: string,
  deadlineMs: number,
): Promise<string> {
  const started = Date.now();

  while (Date.now() - started < deadlineMs) {
    const response = await fetch(
      `${CURSOR_API_BASE}/v1/agents/${agentId}/runs/${runId}`,
      {
        headers: { Authorization: basicAuthHeader(apiKey) },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cursor run poll failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const run = (await response.json()) as RunResponse;
    const status = run.status?.toUpperCase();

    if (status === "FINISHED") {
      const text = run.result?.trim();
      if (!text) {
        throw new Error("Cursor agent finished with empty result");
      }
      return text;
    }

    if (status === "ERROR" || status === "CANCELLED" || status === "EXPIRED") {
      throw new Error(`Cursor agent run ${status ?? "failed"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Cursor agent run poll timed out");
}

/** Create a no-repo cloud agent and return the rewritten email text. */
export async function rewriteViaCursorCloudRest(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(`${CURSOR_API_BASE}/v1/agents`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: { text: prompt },
      // REST API exposes composer-2.5; SDK accepts composer-2 as an alias locally.
      model: { id: "composer-2.5" },
      name: "wingman-segment-rewrite",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cursor API create failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as CreateAgentResponse;
  const agentId = data.agent?.id;
  const runId = data.run?.id;

  if (!agentId || !runId) {
    throw new Error("Cursor API create returned no agent/run id");
  }

  if (data.run?.result?.trim()) {
    return data.run.result.trim();
  }

  if (data.run?.status?.toUpperCase() === "FINISHED" && data.run.result) {
    return data.run.result.trim();
  }

  return pollRunResult(apiKey, agentId, runId, 55_000);
}
