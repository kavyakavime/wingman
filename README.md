# Wingman

**Test before you fly.**

Wingman tests your cold outbound on a digital twin of your real audience before you send a single one.

## How it works

1. **Type your ICP** in plain English and paste a draft cold email, ad, or launch post.
2. **Fiber AI** pulls real, live companies and people matching your ICP — not fake personas, your actual audience.
3. **Orange Slice** enriches a sample into structured personas: funding stage, pain signals, intent score.
4. A **custom multi-agent swarm** (OpenAI GPT-4o, our own code) runs each persona against your draft, producing a first-person reaction, stated reason, and segment tag.
5. Results stream live into a **force-directed 3D graph** (`react-force-graph-3d` with bloom/glow) — nodes cluster by segment, color-coded by sentiment.
6. A **segmented score card** shows predicted reply rate and top objection per segment — CFOs hate the pricing line, VPs of Sales love the ROI angle, founders want more social proof.
7. **Cursor SDK** (`@cursor/sdk`, Composer 2) rewrites your message to fix the top objection; the swarm re-runs once and the score card shows the predicted rate move.
8. **One-click send** via Orange Slice to an opt-in list.

**Convex** is the reactive backend — every agent reaction writes live, the frontend subscribes, and the graph animates in real time instead of loading all at once.

## Setup

```bash
git clone https://github.com/kavyakavime/wingman.git
cd wingman
npm install
cp .env.example .env.local
# Add your NEXT_PUBLIC_CONVEX_URL to .env.local after running convex dev

npx convex dev          # starts Convex dev server + syncs functions
npm run dev             # starts Next.js on http://localhost:3000
```

Set third-party API keys in Convex (never in `.env.local`):

```bash
npx convex env set FIBER_API_KEY your_key
npx convex env set ORANGESLICE_API_KEY your_key
npx convex env set OPENAI_API_KEY your_key
npx convex env set CURSOR_API_KEY your_key
```

See [SECURITY.md](./SECURITY.md) for the full secret-management pattern.

## Project structure

```
app/          Next.js App Router routes
components/   React UI components
convex/       Convex backend functions
lib/          Integration modules (Fiber, Orange Slice, Cursor SDK, OpenAI)
```

## Acknowledgments

Swarm-reasoning approach inspired by [mirofish](https://github.com/mirofish/mirofish). Wingman's swarm engine is an **independent implementation** — not a fork of mirofish or any third-party repo.

Built with Fiber AI, Orange Slice, OpenAI, Cursor SDK, Convex, and Vercel.
