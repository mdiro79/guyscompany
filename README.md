# Guyscompany

Collaboration web app for a 4-person team: a 2D dashboard and a first-person 3D virtual office.
Persian (RTL) and English (LTR), phone and desktop.

## Run locally (demo mode)

```bash
npm install
npm run dev
```

Without Supabase variables the app runs in **demo mode**: in-memory data and four demo accounts
(`mehdi` admin, `sara`, `nima`, `reza`; password `guys1234`). Multiplayer and voice work between tabs of the same browser.

## Production setup (Vercel Hobby + Supabase free)

Zero manual config: import the repo in Vercel, add **Storage → Supabase** (Marketplace) to the project and redeploy.
Each build runs `scripts/db-setup.mjs` (migrations + `supabase-setup.sql`, idempotent); the first visit opens
**/setup** to create the admin, unless `ADMIN_USERNAME` / `ADMIN_PASSWORD` (optional `ADMIN_DISPLAY_NAME`) are set in Vercel, which creates it automatically. Details in Persian: `docs/DEPLOY.md`. Health check: `/api/health`.

Variable names from the integration (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`/`SECRET_KEY`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`) and our own (`.env.example`) both work.

Keys are never committed; source asset zips stay in the repo but are excluded from Vercel (`.vercelignore`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run lint` / `npm run typecheck` / `npm test` | Checks |
| `npm run assets:inspect` | Inspect the extracted character packs in `assets/raw` |
| `npm run assets:select` / `npm run assets:convert` | Pick 4 characters per pack and convert to compact GLB |
| `node scripts/render-thumbs.cjs` | Render character portraits used as avatars |
| `node scripts/screenshot.cjs <url> <dir> <paths…>` | Screenshots at desktop and phone size |

## Docs

- `SPEC-FINAL.md`, `BUILD-INSTRUCTIONS.md` — design and build order
- `docs/DECISIONS.md` — owner decisions during the build
- `docs/ASSETS-REPORT.md` — character packs, selection and licenses (all CC0; Kenney Furniture Kit for office props)
