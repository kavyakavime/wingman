"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function PingStatus() {
  const ping = useQuery(api.ping.get);
  const latest = useQuery(api.ping.latest);
  const record = useMutation(api.ping.record);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Convex connection
      </h2>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600 dark:text-zinc-400">Query status</dt>
          <dd className="font-mono text-zinc-900 dark:text-zinc-100">
            {ping === undefined
              ? "connecting…"
              : ping
                ? `${ping.status} · ${new Date(ping.timestamp).toISOString()}`
                : "error"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600 dark:text-zinc-400">Latest mutation</dt>
          <dd className="font-mono text-zinc-900 dark:text-zinc-100">
            {latest === undefined
              ? "…"
              : latest
                ? `${latest.message} · ${new Date(latest.createdAt).toISOString()}`
                : "none yet"}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => record({ message: "wingman-ping" })}
        className="mt-4 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Send test ping
      </button>
    </div>
  );
}
