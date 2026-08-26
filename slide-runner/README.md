# Slide Runner

A neon 3D tunnel dodge game — hold to rise, release to fall, one hit ends the run.
Built from the Slide Runner game design doc: procedurally generated tunnel
segments, auto-activating power-ups (Boost / Shrink / Reverse), a time-based
difficulty curve, and an addictive instant-retry loop.

## Running it

No build step — open `index.html` in a browser (serving it over `http://`
rather than `file://` is recommended, since it loads ES modules):

```
python3 -m http.server 8000
# then open http://localhost:8000/slide-runner/
```

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | Page shell, HUD, start/game-over overlays, the import map. |
| `style.css` | Neon HUD and menu styling. |
| `game.js` | The whole game: tunnel generation, player physics, power-ups, collisions, camera, rendering. Structured around the update-loop pseudocode from the design doc (`handleInput` → `updatePlayer` → `updatePowerUps` → `updateTunnel` → `checkCollisions` → `updateScore` → `spawnSegmentsIfNeeded`). |
| `vendor/three/` | A trimmed, vendored copy of [three.js](https://threejs.org) r160 (module build + the postprocessing/bloom addons actually used) — MIT licensed, `vendor/three/LICENSE`. Vendored rather than pulled from a CDN so the game runs offline and predictably, matching the rest of this repo's "plain files, no build step" approach. |

## Controls

- **Hold** (pointer/touch) or **↑ / W / Space** — rise
- **Release**, or **↓ / S** — fall
- Position is continuous: tap rhythmically to hover mid-channel.

## Design notes / what's implemented

- **Tunnel**: a chain of interpolated keypoints (`centerY`, `halfHeight`) drives
  a smoothly morphing floor/ceiling, with fixed-band side rails for visual
  enclosure. Segment generators (`genWideOpen`, `genTightSqueeze`, `genZigZag`,
  `genMovingWalls`, `genRotatingBlades`, `genPulsingRings`, `genPerfectLane`,
  `genPowerUpCorridor`) are picked with time-weighted odds matching the GDD's
  hazard-density curve (wide → squeezes → moving walls → blades → rings).
- **Hazards**: rotating blades use a true rotation-based vertical danger
  window (safe when horizontal, deadly when vertical) rather than a fixed
  box, so dodging them is genuinely timing-based.
- **Power-ups**: Boost (1s, invincible + speed + FOV widen), Shrink (3s,
  smaller hitbox), Reverse (0.5s chaotic backward zoom, invincible so the
  "chaos moment" reads as a thrill rather than a cheap death) — both spawned
  by generators and guaranteed every 8–12s (5–8s after 30s) via a timer.
- **Difficulty**: `currentSpeed = baseSpeed + elapsedTime * difficultyFactor`,
  capped at a max speed, exactly per the GDD.
- **Feel**: a brief post-(re)start grace period suppresses death judgment
  (not input) so real-world input latency after tapping "Start" can't kill
  you before you've had a chance to react; a generously wide tutorial
  stretch eases new players into the hold/release rhythm before normal
  channel widths kick in. Near-misses and pickups trigger camera shake.
- **Persistence**: best distance is saved to `localStorage`.
- **Out of scope for this pass**: monetization (interstitial/rewarded ads,
  cosmetic skins) and a server-backed daily leaderboard — those need real ad
  network / backend integrations the GDD doesn't specify, so they're left as
  a clearly marked follow-up rather than stubbed with fake plumbing.
