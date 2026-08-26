# Slide Runner

A neon 3D freefall dive through a sci-fi city — steer in every direction
through a full 4-sided building corridor, hold DIVE to drop faster, one hit
ends the run. Built from the Slide Runner game design doc: procedurally
generated building corridors, auto-activating power-ups (Boost / Shrink), a
time-based difficulty curve, and an addictive instant-retry loop.

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

- **Touch/drag anywhere** — a virtual joystick (ring + nub) appears right
  where you touch down, so there's no fixed hit zone to reach; drag away
  from that point to steer, reaching full deflection within ~60px so it
  stays easy to drive with a small thumb motion. Or **arrows / WASD** —
  steer left/right *and* toward/away from the camera, which reads on screen
  as up/down. Release and you settle back to falling straight; you don't
  snap back to center.
- **DIVE button** (or **Space / Shift**) — hold to tuck into a streamlined
  dive: faster descent (higher score rate), but reduced steering authority
  while tucked — a real risk/reward call, not just a boost.

## Design notes / what's implemented

- **Shaft**: a vertical corridor with buildings on all four sides, camera
  trailing above the falling player and looking down it. The X (left/right)
  channel comes from a chain of interpolated keypoints (`centerY`,
  `halfHeight` internally — they map to the left/right building faces, not
  a floor/ceiling); segment generators (`genWideOpen`, `genTightSqueeze`,
  `genZigZag`, `genMovingWalls`, `genRotatingBlades`, `genPulsingRings`,
  `genFlyingCars`, `genOpenSky`, `genPerfectLane`, `genPowerUpCorridor`) are
  picked with time-weighted odds matching the GDD's hazard-density curve
  (wide → squeezes → moving walls → blades/traffic → rings). The Z
  (toward/away) channel is a real, independently-collidable second axis
  (`boundsZAt`) — a pure function of progress rather than generated
  keypoints, since it only needs to wander and gradually tighten rather than
  carry the same hazard variety as X — with its own front/back building
  walls built from the same function, so what you see always matches what
  can hit you. All of this generation/physics/collision code is written in
  terms of abstract "progress" and "bounded position" — only the rendering
  code at the bottom maps those onto world X/Y/Z, which is what makes this a
  vertical shaft rather than the horizontal tunnel it started as (see the
  coordinate-convention comment at the top of `game.js`).
- **The path itself winds**: `pathCenterX` (two layered sine waves) defines
  a slowly curving centerline for the whole shaft; every X-channel
  generator clamps its wander around that moving center (`clampCenter`) —
  and the tutorial keypoints and `genOpenSky` anchor to it too — instead of
  a fixed 0, so the tunnel visibly curves left/right as it falls rather than
  just dropping straight down with local wobbles. `updateCamera` reads
  `pathCenterXSlope` (the curve's analytic derivative) each frame and banks
  the camera into it via `camera.rotateZ` — applied fresh on top of the
  lookAt orientation every frame (never accumulated), so it's a stable,
  controllable lean rather than drift. `genOpenSky` randomly (weighted into
  every difficulty band) opens the environment into wide-open sky for a
  span — no near hazards, a much wider X channel, and (via `openZones`,
  consulted by `zHalfDepthAt`) a much wider Z channel too — as a breather
  between denser stretches.
- **Player**: a small low-poly figure jointed at the shoulders, elbows, hips
  and knees (not a rigid mesh), in a skydive arch pose by default — idle
  wind-flutter on the limbs, a bank/lean when steering left/right, a pitch
  when steering up/down, and a real pose change (limbs tuck in) when diving,
  all blended rather than snapped.
- **City**: building walls (all four sides) use a procedurally generated
  lit-window facade texture (three warm/cool/gold tints), with rooftop
  towers jutting out from the X walls — built by `buildDetailedBuilding`,
  which stacks an optional setback tier and caps it with a dome or a
  spire-plus-beacon-light, echoing the dense, ornamented reference skyline
  rather than plain boxes — for a jagged silhouette, plus a static
  distant-building field (same tiered/domed builder) that tracks the
  player's fall depth so the city always looks endless, and a warm sun-glow
  sprite fixed in the sky. Flying cars are a genuine moving hazard
  (`genFlyingCars`), not just decoration, and spawn more densely than most
  hazard types for a busier, more dynamic corridor. A cinematic vignette +
  warm horizon tint sits over the render, and the ambient/hemisphere
  lighting and bloom lean warmer and stronger than a typical neon-only
  palette to chase the reference's golden dusk haze.
- **Hazards**: rotating blades use a true rotation-based lateral danger
  window (safe when aligned with the shaft, deadly when aligned across it)
  rather than a fixed box, so dodging them is genuinely timing-based.
- **Camera**: fixed two real bugs found while chasing "movement isn't easy /
  the camera loses the character" reports. (1) The camera looks almost
  straight down (-Y) the whole game, which is a gimbal-lock condition for
  `lookAt()` — nearly parallel to the default up vector (0,1,0), so its
  internal "camera right" cross product went near-degenerate and tiny X/Z
  drift whipped the view into wild uncontrolled rolls. Fixed by pointing
  `camera.up` along -Z instead (perpendicular to the actual view direction),
  which keeps that cross product well-defined. (2) The camera trails the
  player by a fixed offset in Z for a 3/4 chase view; as the Z channel
  tightens that offset could push the camera past the front wall entirely,
  staring through/into it and hiding the player — now clamped against the
  live channel (`boundsZAt`) so the camera always stays a safe margin inside
  it. A speed-based radial motion-streak `ShaderPass` (a handful of samples
  pulled toward screen center, strength driven by `currentSpeed` plus a kick
  for dive/boost) also sells the higher speed visually, not just numerically.
  Also tightened X/Z camera tracking (faster lerp) and trimmed the widest
  channel widths (tutorial stretch, `genOpenSky`, and the open-zone Z
  widening in `zHalfDepthAt`) after feedback that it was too easy to drift
  off-screen and die without warning; a new screen-edge glow (`#edge-warning`,
  driven every frame in `updateCamera` from the real margin to the nearest of
  all four walls) now pulses red as you approach any wall, well before you'd
  clip it.
- **Power-ups**: Boost (1s, invincible + speed + FOV widen), Shrink (3s,
  smaller hitbox) — both spawned by generators and guaranteed every 8–12s
  (5–8s after 30s) via a timer. An earlier Reverse power-up (a brief chaotic
  backward zoom) was cut after player feedback that it felt disorienting
  rather than fun — a "bounce back orb" that punished a hit rather than
  rewarding it, unlike Boost/Shrink.
- **Difficulty**: `currentSpeed = baseSpeed + elapsedTime * difficultyFactor`,
  capped at a max speed (diving multiplies past that cap on purpose — it's
  the skill-based way to outrun the passive curve), exactly per the GDD.
  Base/max speed and the difficulty ramp run noticeably faster than the
  original tuning for a punchier feel; the world-generation lookahead was
  extended to match so nothing pops in at the higher speed. The first ~12s
  of every run is deliberately hazard-free (just the wide, fast, curving
  shaft) — the adrenaline hook is meant to come from speed and the winding
  path, not from dying immediately — and flying cars, the busiest hazard to
  react to, don't enter the generator mix at all until well into the run
  (~55s), rather than greeting a brand-new player.
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
