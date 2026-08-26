# Slide Runner

A neon 3D freefall dive through a sci-fi city — steer left/right between
skyscrapers, hold DIVE to drop faster, one hit ends the run. Built from the
Slide Runner game design doc: procedurally generated building corridors,
auto-activating power-ups (Boost / Shrink / Reverse), a time-based
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

- **Tap/hold left or right half of the screen**, or **← A / D →** — steer.
  Release and you settle back to falling straight, you don't snap back to
  center.
- **DIVE button** (or **Space / Shift / ↓ / S**) — hold to tuck into a
  streamlined dive: faster descent (higher score rate), but reduced steering
  authority while tucked — a real risk/reward call, not just a boost.

## Design notes / what's implemented

- **Shaft**: a vertical corridor between two rows of buildings, camera
  trailing above the falling player and looking down it. A chain of
  interpolated keypoints (`centerY`, `halfHeight` internally — they map to
  the left/right building faces, not a floor/ceiling) drives a smoothly
  morphing left/right channel. Segment generators (`genWideOpen`,
  `genTightSqueeze`, `genZigZag`, `genMovingWalls`, `genRotatingBlades`,
  `genPulsingRings`, `genFlyingCars`, `genPerfectLane`, `genPowerUpCorridor`)
  are picked with time-weighted odds matching the GDD's hazard-density curve
  (wide → squeezes → moving walls → blades/traffic → rings). All of this
  generation/physics/collision code is written in terms of abstract
  "progress" and "bounded lateral position" — only the rendering code at the
  bottom maps those onto world X/Y/Z, which is what makes this a vertical
  shaft rather than the horizontal tunnel it started as (see the
  coordinate-convention comment at the top of `game.js`).
- **Player**: a small low-poly figure jointed at the shoulders, elbows, hips
  and knees (not a rigid mesh), in a skydive arch pose by default — idle
  wind-flutter on the limbs, a bank/lean when steering, and a real pose
  change (limbs tuck in) when diving, all blended rather than snapped.
- **City**: building walls use a procedurally generated lit-window facade
  texture (three warm/cool/gold tints), with rooftop towers jutting out —
  built by `buildDetailedBuilding`, which stacks an optional setback tier
  and caps it with a dome or a spire-plus-beacon-light, echoing the dense,
  ornamented reference skyline rather than plain boxes — for a jagged
  silhouette, plus a static distant-building field (same tiered/domed
  builder) that tracks the player's fall depth so the city always looks
  endless, and a warm sun-glow sprite fixed in the sky. Flying cars are a
  genuine moving hazard (`genFlyingCars`), not just decoration, and spawn
  more densely than most hazard types for a busier, more dynamic corridor.
  A cinematic vignette + warm horizon tint sits over the render, and the
  ambient/hemisphere lighting and bloom lean warmer and stronger than a
  typical neon-only palette to chase the reference's golden dusk haze.
- **Hazards**: rotating blades use a true rotation-based lateral danger
  window (safe when aligned with the shaft, deadly when aligned across it)
  rather than a fixed box, so dodging them is genuinely timing-based.
- **Power-ups**: Boost (1s, invincible + speed + FOV widen), Shrink (3s,
  smaller hitbox), Reverse (0.5s chaotic backward zoom, invincible so the
  "chaos moment" reads as a thrill rather than a cheap death) — both spawned
  by generators and guaranteed every 8–12s (5–8s after 30s) via a timer.
- **Difficulty**: `currentSpeed = baseSpeed + elapsedTime * difficultyFactor`,
  capped at a max speed (diving multiplies past that cap on purpose — it's
  the skill-based way to outrun the passive curve), exactly per the GDD.
  Base/max speed and the difficulty ramp all run noticeably faster than the
  original tuning for a punchier feel; the world-generation lookahead was
  extended to match so nothing pops in at the higher speed.
- **Feel**: a brief post-(re)start grace period suppresses death judgment
  (not input) so real-world input latency after tapping "Start" can't kill
  you before you've had a chance to react; a generously wide tutorial
  stretch eases new players into steering before normal channel widths kick
  in. Near-misses and pickups trigger camera shake.
- **Persistence**: best distance is saved to `localStorage`.
- **Out of scope for this pass**: monetization (interstitial/rewarded ads,
  cosmetic skins) and a server-backed daily leaderboard — those need real ad
  network / backend integrations the GDD doesn't specify, so they're left as
  a clearly marked follow-up rather than stubbed with fake plumbing.
