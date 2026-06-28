# Security

Wingman is an **open-source public repository**. Treat every commit as visible to the world.

## Secret management pattern

### Client (Next.js)

The only environment variable the browser needs is:

```
NEXT_PUBLIC_CONVEX_URL=<your Convex deployment URL>
```

Copy `.env.example` to `.env.local` and fill in that value locally. **Never commit `.env.local` or any `.env*` file with real values.**

### Server (Convex actions)

All third-party API keys are stored in **Convex environment variables**, not in this repo:

```bash
npx convex env set FIBER_API_KEY your_key_here
npx convex env set ORANGESLICE_API_KEY your_key_here
npx convex env set OPENAI_API_KEY your_key_here
npx convex env set CURSOR_API_KEY your_key_here
```

Convex actions read these at runtime via `process.env`. They never ship to the browser and are never bundled into Next.js client code.

## What is gitignored

- `.env*` (including `.env.local`)
- `node_modules/`
- `.next/`
- `.vercel/`
- `*.log`
- `.DS_Store`
- `/secrets/`
- `/credentials/`

## Before you commit

```bash
git status
```

Confirm **no** `.env*` files appear in staged changes. If they do, unstage them immediately:

```bash
git reset HEAD .env.local
```

## Reporting issues

If you discover exposed credentials in the git history, rotate the affected keys immediately and open an issue so maintainers can purge them from history if needed.
