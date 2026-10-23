# Owner decisions during build

- Dashboard hero banner: use a render of our own 3D office scene (not a stock photo). Until stage 3 exists, stage 2 uses a temporary placeholder; after stage 3 the banner is captured from the scene and replaced.
- Team size: 4 members (the 8 people in the dashboard reference image are illustrative only).
- Stage 2 includes Board, List and Timeline views, plus Calendar and Files pages.
- Office map: elements with no function are removed (e.g. the top notch/window between the two upper offices and the curved desk behind the conference room).
- Characters: the 20 in `assets/characters.json` are approved (Cat included).
- Emotes: shown as a bubble above each character's head (no face plane on the model).
- Sitting for characters without a sit animation: posed in code; flying characters hover above the chair.
- Source zips stay in the repo but are excluded from the site (`.vercelignore`; only `public/models/` is served).
- Office door rules for visitors: locked or frosted → closed; private → only members with an accepted private-chat invite; public → open, view only (only the owner sits at the desk).
- Talking without a mouth: the head nods and the arms move with the voice level (owner decision); emotes show in a bubble above the head.
- Furniture: Kenney Furniture Kit (CC0) from a GitHub mirror (github.com/ETdoFresh/kenney.nl); walls, glass, doors, floor lines are built in code.
- Office fixes (owner request): building and conference room enlarged (corridor half width 7 m, offices 8×8 m, conference radius 4.5 m); compact reception desk with a chair, the receptionist sits and types; her tour walks to each area (reception, floor lines, conference room, office, desk/dashboard, lounge) with the speech bubble above her head; E next to her replays it.
- Doors (offices, conference room, entrance) open and close with E; state is shared over the WebRTC events channel (newest command wins). Visitors without access always see an office door closed. Glass porch outside the entrance.
- Characters, chairs, plants and door leaves block walking. A taken chair cannot be used by a second person.
- At a desk monitor only the Fullscreen and Exit buttons are shown; in fullscreen they sit in a 48 px bar above the dashboard so nothing covers it.
- Computers: Tab switches between mouse look and a brand-styled cursor. Conference/lounge chairs allow free looking around.
- Phones in landscape (height ≤ 500 px, `short:` variant): side menu instead of the bottom bar, compact office UI.
