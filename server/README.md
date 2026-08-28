# Elemental Arena Server

Authoritative server for both the lobby and the live match: a teacher
creates a room and gets a code, students join with it, and once a student
enters the arena the server runs the actual game (movement, energy regen,
shop purchases, ability casts, combat, win condition) — clients only send
input and intent, and render whatever the server broadcasts. In-memory
only — rooms and matches disappear on restart, which is fine for now but
means this doesn't yet survive a server redeploy or run across multiple
instances (see the comment in `rooms.js`).

## Run locally

```
npm install
npm run dev
```

Listens on `:3001` by default (`PORT` env var to change). The frontend
(`elemental-arena/`) points at `http://localhost:3001` unless
`VITE_SERVER_URL` is set.

## What's here so far

**Lobby**
- `teacher:create-room` → room code
- `player:join-room` `{ code, name }` → joins, broadcasts the roster
- `room:players-updated` / `room:closed` — broadcast to everyone in a room

**Match** (`game/match.js` — the authoritative game state, ticked ~20Hz)
- `arena:enter` → spawns the player into the room's match, returns a
  snapshot and the player's own id
- `arena:input` `{ up, down, left, right }` → raw movement input
- `arena:cast-ability` `{ abilityName }` → validates unlock + energy +
  match phase, applies attack/defend/build, broadcasts an `arena:effect`
- `arena:shop-buy` `{ abilityName }` → starts a purchase (must be standing
  at the right shop), returns a question
- `arena:answer` `{ answerIndex }` → checks the answer, tracks progress
  toward that item's `unlockCost`, unlocks on success
- `teacher:start-battle` → skips the prep countdown early
- `arena:state` — full match snapshot, broadcast to the room every tick

## Known simplifications (fine for now, worth revisiting)

- **No block collision for movement.** Placed blocks render and are
  strategic cover, but don't currently stop a player from walking through
  one — re-implementing Arcade-physics-style collision resolution
  server-side is a bigger lift than this pass needed.
- **`game/` here is duplicated** from `elemental-arena/src/game/`
  (abilities, shops, elements, question bank), not shared via a workspace
  package. Fine while both are small; worth consolidating before this
  grows much further, since the two copies can drift.
- **No reconnect handling.** A dropped connection just removes the player
  from the match; there's no way to rejoin an in-progress match yet.
- **Scales to a handful of players, not 30, without more work.** The
  architecture (server-authoritative, generic player list, tick + snapshot
  broadcast) is the right shape for that, but nothing here has been load
  tested, and 30 players broadcasting a full snapshot at 20Hz to everyone
  is a real bandwidth/CPU question worth measuring before relying on it.
