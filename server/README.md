# Two-Base Team Arena Server

Complete redesign from the earlier "Elemental Arena" open-world concept —
see the phase plan below. The server is authoritative for the lobby and
the live match: room creation/joining, team assignment, movement, melee
combat, disable/respawn. Clients only send input and intent, and render
whatever the server broadcasts. In-memory only — rooms and matches
disappear on restart.

## Run locally

```
npm install
npm run dev
```

Listens on `:3001` by default (`PORT` env var to change). The frontend
(`elemental-arena/`) points at `http://localhost:3001` unless
`VITE_SERVER_URL` is set.

## Core concept

Two teams (Red, Blue) fight across a battlefield with a base on each
side. Players punch to disable enemies (3 hits, then forced respawn at
their own barracks). Later phases add stationary weapons (cannons,
artillery, turrets), a fire system, repair, robot dogs, sabotage, and a
teacher Q&A resource economy — see the phase plan.

## What's here so far (Phase 1)

**Lobby** — unchanged from before:
- `teacher:create-room` → room code
- `player:join-room` `{ code, name }` → joins, broadcasts the roster
- `room:players-updated` / `room:closed`

**Match** (`game/match.js`, ticked ~20Hz)
- `arena:enter` → assigns the player to a team (round-robin) and a spawn
  point in that team's base, returns a snapshot and the player's own id
- `arena:input` `{ up, down, left, right }` → raw movement input
- `arena:punch` → hits the nearest enemy within range if off cooldown;
  3 hits disables them, teleports them to their barracks, and starts a
  respawn timer; broadcasts an `arena:effect` for the visual
- `arena:state` — full match snapshot, broadcast every tick

## Phase plan

| Phase | What | Status |
|---|---|---|
| 1 | Two teams, two bases, melee punch, disable/respawn | ✅ this pass |
| 2 | Cannons: load → auto-fire, damage/repair | not started |
| 3 | Fire system: start, spread, extinguish with water | not started |
| 4 | Repair generalized to all machines | not started |
| 5 | Robot dogs: kennel, battery activation, turret/cannon counters | not started |
| 6 | Sabotage routes, artillery, ammo depot explosions | not started |
| 7 | Teacher Q&A → resource economy | not started |

## Known simplifications

- **No base-destruction win condition yet** — Phase 1 is a continuous
  melee sandbox to prove the core loop; a real objective/win condition
  makes more sense once cannons/artillery (the actual damage-dealing
  systems against buildings) exist.
- **`game/` here is duplicated** from `elemental-arena/src/game/` (teams,
  bases), not shared via a workspace package. Fine while small.
- **No reconnect handling.** A dropped connection just removes the
  player from the match.
- **Not load-tested toward 30 players.** The architecture (server-
  authoritative, generic player list, tick + snapshot broadcast) is the
  right shape for it, but that's a real measurement to make, not assume.
