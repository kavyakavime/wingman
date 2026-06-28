# Wingman — Project Spec

## One-liner

Wingman tests your cold outbound on a digital twin of your real audience before you send a single one.

## Pitch

You type your ICP in plain English. Wingman pulls back real, live people and companies through Fiber AI — not fake personas, your actual audience. Orange Slice enriches each one into a structured profile: funding stage, pain signals, intent score. Then Wingman fires your draft message at a custom reasoning swarm built on those real profiles. Each agent reacts in character, stating exactly why, and clusters visibly by segment on a live, glowing 3D graph — so you see not one useless aggregate score but three verdicts: CFOs hate the pricing line, VPs of Sales love the ROI angle, founders want more social proof. The swarm surfaces the single biggest objection, a Cursor SDK agent rewrites your message to fix it, and you watch your predicted reply rate move in real time. One click sends the winning version through Orange Slice, for real. That's Wingman. **Test before you fly.**

## Pipeline (7 steps)

1. **Fiber AI** — User types ICP in plain English. Fiber pulls real, live companies/people matching the ICP. Proof-of-grounding moment: "this is your real audience, live."
2. **Orange Slice** — Enriches a sample into structured personas: funding stage, pain signals, intent score.
3. **Custom multi-agent swarm** (OpenAI GPT-4o, our own code, NOT a fork) — Each persona agent reacts in character to the draft message, producing a first-person reaction + stated reason + segment tag, citing real signals.
4. **Live 3D graph** — `react-force-graph-3d` with bloom/glow postprocessing. Nodes cluster by segment, color-coded by sentiment. Reactions stream in live via Convex subscriptions.
5. **Segmented score card** — Predicted reply rate + top objection per segment (not one aggregate score).
6. **Rewrite step** — Cursor SDK (`@cursor/sdk`, model `composer-2`, OpenAI fallback) generates a variant addressing the top objection. Swarm re-runs once. Score card shows predicted rate move.
7. **One-click send** — Orange Slice fires the winning version to an opt-in list.

## Stack

| Platform | Role |
|---------|------|
| **Fiber AI** | Real-time company/people search on typed ICP — the audience itself |
| **Orange Slice** | Persona enrichment (funding, pain, intent) + real send at the end |
| **Custom swarm engine** | Persona agents reacting in character, segment-tagged, citing real signal — the centerpiece |
| **OpenAI (GPT-4o)** | Primary reasoning model for every swarm agent call |
| **Cursor SDK (`@cursor/sdk`, Composer 2)** | Rewrite step embedded live in the product |
| **Convex** | Reactive backend — every agent reaction streams live the instant it's written |
| **react-force-graph-3d + bloom** | Live 3D graph clustered by segment, color by sentiment |
| **Next.js on Vercel** | Deployed from hour one |

## Convex as the reactive nervous system

Every agent reaction writes to Convex. The frontend subscribes live. This is what makes the graph animate in real time instead of loading all at once.

## Security (public repo)

- All third-party API keys live in **Convex env vars** (`npx convex env set KEY value`), never in client code or `.env.local`.
- See `SECURITY.md` for the full pattern.

## Folder structure

```
/app          — Next.js App Router routes
/components   — React UI components
/convex       — Convex functions (queries, mutations, actions)
/lib          — Integration stubs (fiber, orangeslice, cursorSdk, openai)
```

## Inspiration

Swarm-reasoning approach inspired by [mirofish](https://github.com/mirofish/mirofish) — **independent implementation, not a fork.**
