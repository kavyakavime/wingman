# Wingman

**Test before you fly.**

Wingman is a GTM simulation product: describe an ICP in plain English, pull real decision-makers, enrich them with live signals, run a cold email through a digital twin swarm built from those profiles, watch objections cluster by segment on a live 3D graph, rewrite per segment with Cursor SDK, re-test, and send the winning variant — all in one loop.

Most outbound tools optimize sending. Wingman optimizes knowing whether a message will work before it leaves the inbox.

---

## Overview

Wingman runs on a single integrated pipeline. Each stage depends on a specific platform in the stack — audience search, enrichment, simulation, rewrite, and send are separate concerns wired together through Convex.

| Layer | What happens |
|-------|----------------|
| **Audience** | Orange Slice workflow resolves ICP → target companies → decision-makers via LinkedIn B2B; checkpointed in a live spreadsheet |
| **Enrichment** | Fiber supplies live LinkedIn activity; Orange Slice supplies pain signals, funding context, and firmographics |
| **Simulation** | OpenAI GPT-4o runs a two-round persona swarm — solo reactions, then peer influence — on enriched profiles |
| **Rewrite** | Cursor Cloud Agents produce one draft variant per segment, grounded in swarm objections |
| **Delivery** | Orange Slice sends the winning variant through Gmail |
| **Realtime UI** | Convex subscriptions stream leads, enrichments, and swarm reactions as they complete |

The full path — search → dual enrich → multi-round swarm → segment rewrite → re-swarm → send — lives in one workspace. Nothing is exported to a spreadsheet and re-imported; nothing is a one-off script.

---

## The pipeline

```
ICP in chat
    │
    ▼
Hybrid audience search ── Orange Slice workflow (companies → getEmployeesFromLinkedin)
    │
    ▼
Dual enrichment ── Fiber live LinkedIn activity + Orange Slice pain/funding
    │
    ▼
Draft message ── user pastes cold email in chat
    │
    ▼
Swarm round 1 ── OpenAI GPT-4o: each lead reacts in character, cites real signals
    │
    ▼
Swarm round 2 ── peer influence: personas see how others reacted, update sentiment
    │
    ▼
Segment score card ── predicted reply rate + top objections per segment
    │
    ▼
Cursor rewrite ── one variant per segment, fed swarm objections; swarm re-runs
    │
    ▼
Send ── Orange Slice Gmail integration delivers the winning variant
```

---

## Stack

### Fiber AI

Fiber handles **live LinkedIn signal enrichment** — not audience search.

When a user enriches selected leads, Fiber's activity APIs fetch the person's latest LinkedIn post or interaction and write it to the **Live signal** column. That signal feeds the swarm: persona agents cite `fiberSignal` alongside Orange Slice's `painSignal` when reacting, so objections trace back to real profile activity rather than invented context.

| API | Location | Purpose |
|-----|----------|---------|
| Live activity fetch | `lib/fiber.ts` → `lib/enrichLead.ts` | Latest LinkedIn post or activity with signal kind |
| Kitchen-sink lookup | `lib/fiber.ts` | Deterministic person resolution for locked demo personas |

**Dual enrichment.** Orange Slice runs first on profile and company data (pain, funding, intent). Fiber adds the live layer on top. Both write to the same lead row — separate columns in the spreadsheet.

**Swarm grounding.** OpenAI persona agents reference enriched signals from both platforms when producing first-person reactions.

---

### Orange Slice

Orange Slice is the **audience search and workflow engine** — plus persona enrichment, run logging, and outbound send. Wingman embeds the [engineered workflow pattern](https://www.orangeslice.ai) Orange Slice documents for revenue ops: pull → enrich in loop → checkpoint → downstream action.

When a user types an ICP like *"CEO and CTO of humanoid robot labs"*, Orange Slice resolves target companies, pulls decision-makers via `getEmployeesFromLinkedin`, and streams results into Wingman while checkpointing each row in a live spreadsheet.

| API | Location | Purpose |
|-----|----------|---------|
| `services.company.getEmployeesFromLinkedin` | `lib/orangeSliceWorkflow.ts` | Pull CEOs/CTOs/founders at target companies |
| `services.company.linkedin.findUrl` + `enrich` | workflow + `lib/orangeslice.ts` | Company slugs, logos, funding context |
| `services.ai.generateObject` | workflow + enrichment | ICP → company list; pain signal, intent score, funding stage |
| `services.person.linkedin.enrich` | enrichment pipeline | Extended profile fields |
| `services.web.batchSearch` | `lib/orangeslice.ts` | Recent activity via site search when needed |
| `ctx.createSpreadsheet` + `sheet.addRows` | `lib/orangeSliceWorkflow.ts` | Checkpointed live run log |
| `integrations.gmail.sendEmail` | `lib/orangeslice.ts` → `convex/sendActions.ts` | Outbound send via connected Gmail |
| `POST /execute/email` | fallback send path | Managed sender when Gmail isn't connected |

**Workflow, not a thin wrapper.** `workflows/wingman-audience.workflow.ts` and `lib/orangeSliceWorkflow.ts` follow Orange Slice's documented shape: spreadsheet as source of truth, per-lead status, failures isolated per row.

**Inspectable runs.** Every search stores an Orange Slice spreadsheet ID on the Convex `audienceRuns` record. The same run is visible in Wingman and in the Orange Slice dashboard.

**Closed loop.** Orange Slice sources the audience, enriches personas, and delivers the message — segment rewrites go out through Gmail after swarm validation.

---

### OpenAI (GPT-4o)

OpenAI powers the reasoning layer: swarm reactions, peer influence, ICP relevance filtering, and rewrite fallback.

| Capability | Location | Purpose |
|------------|----------|---------|
| Structured outputs (`json_schema`, strict) | `lib/openai.ts` | Swarm reactions return `{ sentiment, reasoningText, citedSignal }` |
| GPT-4o chat completions | swarm, peer round, ICP filter, rewrite fallback | In-character persona agents using enriched lead data |
| ICP attachment parsing | `lib/icpAttachment.ts` | PDF/doc upload → searchable ICP string |
| Relevance gate | `lib/icpLeadFilter.ts` | Post-search filter for ICP fit |

**Two-round swarm.** Round 1: each lead reacts independently. Round 2 (`convex/swarmRound2.ts`): personas see anonymized peer summaries and update sentiment — modeling how objections propagate across a buying committee.

**Grounded reactions.** Prompts require agents to reference `painSignal`, `fiberSignal`, or `recentActivity`, so the graph shows why someone objected.

**Segment scoring.** `lib/scoreCard.ts` aggregates reactions into scaled / early_stage / vertical_specialist buckets with per-segment predicted reply rates and objection lists that feed Cursor rewrites.

---

### Cursor SDK

After the swarm surfaces segment-level objections, Cursor Cloud Agents (Composer 2.5) rewrite the draft once per segment.

| Surface | Location | Purpose |
|---------|----------|---------|
| Cloud Agents REST API (`composer-2.5`) | `lib/cursorCloudRest.ts` → `lib/cursorRewriteConvex.ts` | Production path inside Convex `"use node"` actions |
| `@cursor/sdk` | `lib/cursorSdk.ts` | Local dev and verification |
| Segment-conditioned prompts | `lib/cursorRewriteShared.ts` | Objections, sentiment, and segment copy guidance per rewrite |

**Segment-specific rewrites.** `convex/rewriteActions.ts` passes top cited signals and full objection text from the score card — early_stage copy differs from scaled.

**Rewrite → re-swarm.** `retestRewrittenVariants` re-runs the swarm on segment rewrites so the score card shows before/after predicted reply rate.

**Fallback.** If Cursor times out, GPT-4o rewrites with the same objection context; `rewriteDiffersEnough` rejects near-identical output.

---

### Convex

Convex is the reactive backend. The UI subscribes to queries; when a lead inserts, an enrichment completes, or a swarm agent finishes, the spreadsheet and graph update without polling.

| Feature | Location | Purpose |
|---------|----------|---------|
| Queries + subscriptions | `convex/leads.ts`, `convex/agentReactions.ts` | Live spreadsheet, graph, score card |
| `"use node"` actions | `fiberActions`, `enrichActions`, `swarmActions`, `rewriteActions`, `sendActions` | Server-side integration calls with env-isolated keys |
| Internal mutations | `insertLead`, `applyLeadEnrichment`, `insertInternal` | Incremental writes as long actions progress |
| Schema + indexes | `convex/schema.ts` | `audienceRuns`, `leads`, `agent_reactions`, `segment_rewrites`, `sent_log` |

Leads stream into the spreadsheet during search. Swarm reactions populate the graph as they arrive. Segment rewrites and send logs persist for audit and replay.

---

## Design principles

**Real profiles, not synthetic panels.** Orange Slice resolves ICP text to named executives with LinkedIn URLs; Fiber adds live activity on enrich. The swarm simulates against those profiles.

**Segment-level feedback.** Reply predictions and objections are grouped by segment — scaled, early_stage, vertical_specialist — rather than collapsed into one aggregate score.

**End-to-end loop.** Search, enrich, simulate, rewrite, re-test, and send happen in one product. Cursor rewrites trigger from swarm output, persist per segment, get re-simulated, and ship through Orange Slice.

**Checkpointed workflows.** Orange Slice runs follow the pull → enrich → log pattern with spreadsheet checkpoints and per-row status — durable, inspectable, recoverable.

**Live UI.** Convex subscriptions push partial results as actions complete: rows appear during search, nodes update as reactions land.

---

## Setup

```bash
git clone https://github.com/kavyakavime/wingman.git
cd wingman
npm install
cp .env.example .env.local

npx convex dev          # Convex dev server + function sync
npm run dev             # Next.js → http://localhost:3000
```

Set API keys in Convex (never in client code):

```bash
npx convex env set FIBER_API_KEY your_key
npx convex env set ORANGESLICE_API_KEY your_key
npx convex env set OPENAI_API_KEY your_key
npx convex env set CURSOR_API_KEY your_key
```

Optional: connect Gmail for live send (`npm run connect:gmail`).

See [SECURITY.md](./SECURITY.md) for the full secret-management pattern.

---

## Project structure

```
app/                    Next.js App Router
components/
  workspace/            Chat, spreadsheet, swarm graph, rewrite tab
convex/
  fiberActions.ts       Orange Slice audience search action
  enrichActions.ts      Fiber + Orange Slice dual enrich
  swarmActions.ts       OpenAI swarm (round 1 + peer round 2)
  rewriteActions.ts     Cursor segment rewrites + re-test
  sendActions.ts        Orange Slice outbound send
  leads.ts              Runs, leads, enrichment mutations
  schema.ts             Typed tables + indexes
lib/
  fiber.ts              Fiber live activity enrichment
  orangeSliceWorkflow.ts Orange Slice engineered workflow
  orangeSliceLeads.ts   Hybrid search merge + ICP filter
  orangeslice.ts        Enrichment + send helpers
  openai.ts             Swarm + peer influence prompts
  cursorRewriteShared.ts Segment rewrite prompts (Cursor + fallback)
  scoreCard.ts          Segment objection aggregation
workflows/
  wingman-audience.workflow.ts  Reference Orange Slice workflow script
```
