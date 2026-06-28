# Deployment notes (Wingman hackathon)

## Prod vs local — do not mix them

| Target | Convex deployment | Browser / app URL |
|--------|-------------------|-------------------|
| **Prod (judged)** | `formal-monitor-473` | https://wingman-gamma-sepia.vercel.app |
| Local dev | `local-*` on `127.0.0.1:3210` | http://localhost:3000 |

Localhost uses `NEXT_PUBLIC_CONVEX_URL` from `.env.local`, which points at **local** Convex by default. Data written via `npx convex run` without a deployment flag also goes to **local**. That is not what gets judged.

## Rule from hour 4 onward

Every **`npx convex run`** that writes or reads production data must include:

```bash
--deployment-name formal-monitor-473
```

Manual testing in the browser should use the **live Vercel URL**, not localhost:

https://wingman-gamma-sepia.vercel.app

Deploy Convex functions to prod before running prod commands:

```bash
npx convex deploy --yes
```

Ensure prod env has API keys (one-time):

```bash
npx convex env set FIBER_API_KEY '<key>' --deployment-name formal-monitor-473
npx convex env set ORANGESLICE_API_KEY '<key>' --deployment-name formal-monitor-473
```

## Locked demo personas — one-command seed (preferred)

The 6 locked personas are **not** reliably reachable via broad NLP search. Use the deterministic seed action instead — one call, no `runId`, idempotent:

```bash
npx convex deploy --yes
npx convex run seedDemo:seedLockedDemoPersonas '{}' --deployment-name formal-monitor-473
```

This uses Fiber `POST /v1/kitchen-sink/person` (name + company + `forceCompanyMatch`) per persona, upserts into `leads`, enriches via Fiber activity + Orange Slice, and assigns segments.

Verify after seeding:

```bash
npx convex run leads:verifyLockedSegments '{}' --deployment-name formal-monitor-473
npx convex run leads:debugLeadNames '{}' --deployment-name formal-monitor-473
```

## Hour 5 — swarm reasoning (prod)

Set OpenAI key on prod (one-time):

```bash
npx convex env set OPENAI_API_KEY '<key>' --deployment-name formal-monitor-473
```

After deploy, run the swarm from the Vercel app (Swarm test section) or CLI:

```bash
npx convex run swarmActions:runSwarm '{"draftMessage":"…"}' --deployment-name formal-monitor-473
```

Reactions stream into `agent_reactions` as each of the 6 parallel agents completes.

## Known data quirk (broad NLP search only)

The hour-2 **broad** Fiber search returns ~25 people. Among them there can be a duplicate **Ian Bernstein** row:

- `"Ian Bernstein 🤖🛠️"` — normalizes to `"ian bernstein ️"` (does **not** match the locked persona)
- `"Ian Bernstein"` — the locked demo record; this is the one enrichment and segments use

Harmless while we only operate on the 6 locked personas. The kitchen-sink seed always stores the clean `"Ian Bernstein"` name from `LOCKED_DEMO_PERSONAS`.

## Legacy multi-step seed (deprecated for locked 6)

The old chain (`startSearch` → `fetchAudience` → `enrichLockedPersonas` → `markLockedDemo` → `assignLockedSegments`) depends on a non-reproducible broad search. Keep `fetchAudience` for the live “type your own ICP” demo only.
