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

1. Create a Supabase project. Copy `.env.example` to `.env.local` and fill in URL, anon key, service-role key and
   the pooler connection string (`DATABASE_URL`, transaction mode, port 6543).
2. Apply the schema: `npm run db:migrate`, then run `supabase-setup.sql` in the Supabase SQL editor
   (RLS, Realtime publication, the 4 office slots, private `files` bucket).
3. Create the first admin: `node --env-file=.env.local scripts/create-admin.mjs <username> "<name>" <password>`.
   The admin creates the other accounts in **Admin**; every new account must change its password on first login.
4. Import the repo in Vercel, add the same variables plus `CRON_SECRET`. `vercel.json` schedules the daily cleanup
   (`/api/cron/cleanup`), which also keeps the free Supabase project from pausing.
5. Optional TURN for strict networks: `NEXT_PUBLIC_TURN_URLS`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`.

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
