# Elemental Arena Server

Lobby/room server for the game: a teacher creates a room and gets a code,
students join with it, everyone sees the live roster over a WebSocket
(Socket.IO). In-memory only — rooms disappear on restart, which is fine for
now but means this doesn't yet survive a server redeploy or run across
multiple instances (see the comment in `rooms.js`).

## Run locally

```
npm install
npm run dev
```

Listens on `:3001` by default (`PORT` env var to change). The frontend
(`elemental-arena/`) points at `http://localhost:3001` unless
`VITE_SERVER_URL` is set.

## What's here so far

- `teacher:create-room` → room code
- `player:join-room` `{ code, name }` → joins, broadcasts the roster
- `room:players-updated` / `room:closed` — broadcast to everyone in a room
- `teacher:start-battle` — stubbed, not yet wired to the actual arena

## Not yet built

The actual game (movement, abilities, shop purchases, combat) still runs
entirely client-side per browser tab — this server only handles the lobby.
Next step is moving that game state onto the server so it's authoritative
across real network connections instead of local React state.
