# Two-Base Team Arena — Frontend

Client for a browser-based multiplayer classroom game, built with React +
Vite + Phaser. See `../server/README.md` for the game concept and phase
plan — this redesigned the earlier "Elemental Arena" open-world idea into
a two-team melee arena.

## Getting started

```
npm install
npm run dev
```

Needs the server running too — see `../server/README.md`. Set
`VITE_SERVER_URL` if it's not on `localhost:3001`.

## Structure

- `src/pages/` — routed pages (Home, JoinGame, TeacherDashboard, Game1)
- `src/components/` — HUD, GameCanvas (mounts Phaser), QuestionModal
  (kept for the Phase 7 teacher Q&A resource economy, unused for now)
- `src/game/` — `teams.js`/`bases.js` (mirrors the server's, purely for
  rendering), `gameEvents.js` (the React <-> Phaser bridge),
  `scenes/ArenaScene.js` (the renderer — no game rules live here, see
  its file comment)
- `src/net/socket.js` — the Socket.IO client connection

The server (`../server/`) is authoritative for everything — position,
team assignment, melee hits, disable/respawn. This client only sends
input/intent and renders whatever the server broadcasts.
