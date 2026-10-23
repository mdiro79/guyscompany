# Build status

All stages of `BUILD-INSTRUCTIONS.md` are implemented on branch `claude/vibrant-mayer-b4q1xx`.

| Stage | What exists | How it was checked |
|---|---|---|
| 0 Assets | 20 characters (4 per pack, Cat included), compact GLB, portraits; Kenney furniture | contact sheets, `docs/ASSETS-REPORT.md` |
| 1 Foundation | Next.js + TS + Tailwind + next-intl (fa/en), Drizzle schema + migration, Supabase Auth (username → `@guyscompany.local`), admin accounts, forced password change, cookie session, demo mode | e2e script `scripts/e2e-account.cjs`; Drizzle store tested on PGlite (`src/lib/data/db-store.test.ts`) |
| 2 Dashboard | top bar (search ⌘K, focus, theme, notifications), sidebar + mic panel, kanban board/list/timeline, team chat (reactions, files ≤20 MB), vote/focus/office-map widgets, projects, calendar (Jalali for fa), files, team, user panel | screenshots desktop/phone, light/dark, fa/en |
| 3 3D office | "+" plan, glass conference room, 4 offices, reception, floor lines, first person, arms, sit (E) with dashboard on monitor/fullscreen, joystick + drag on phones, auto low quality | screenshots from 8 viewpoints, layout/collision tests |
| 4 Multiplayer | presence, WebRTC data channels for position (no DB), last command wins with server-corrected clock, chat/emote bubbles with history + counter | `scripts/sync-test.cjs` (two tabs, same user) |
| 5 Characters | pick one of 20 (rotating 3D preview), head/arm motion while talking, 12 emotes | screenshots |
| 6 Voice | audio-only mesh, one active mic (phone or computer), Steam Deck panel, proximity volume, focus mode, optional TURN | code path; needs two real people to verify by ear |
| 7 Offices | frosted/clear glass, lock, focus, public (view only), 30-day visitors, private chat after invite acceptance, admin assignment, member swaps by mutual agreement | door-rule tests |
| 8 Ideas | polls 1–10 hidden until close (scores redacted server-side), manager decides ties, projects, volunteer roles | unit tests |
| 9 Polish | receptionist tutorial, contextual key hints, user panel, daily cleanup cron (also keeps Supabase awake) | e2e tutorial check |

## Not verified here
- Real Supabase/Vercel run: no keys in this environment. Setup steps are in `README.md` (`supabase-setup.sql` adds RLS, Realtime, office slots and the storage bucket).
- Voice between different people and multiplayer between different users across networks (demo mode connects tabs of one browser only).
- TURN quota: not checked live (provider sites are blocked here). Free options to evaluate: Cloudflare Realtime TURN and Metered Open Relay; set `NEXT_PUBLIC_TURN_*`.
