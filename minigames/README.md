# Minigames

Standalone, single-file HTML5 canvas prototypes — no build step, no dependencies.
Open any `.html` file directly in a browser to play.

| File | Game |
|---|---|
| `jetbreak.html` | **Jetbreak** — jetpack endless runner/level, wired for **Poki** submission. Thrust, ball-roll, parachute burst, wingsuit rampage, helicopter/armor/extra-life power-ups, 4 escalating threat tiers, a ~3,000m extraction goal (Level 1: Burning City). |
| `jetbreak-crazygames.html` | Same game, wired for **CrazyGames** submission instead. Keep both in sync if you change gameplay — only the ad-portal adapter block near the top of the script differs between the two files. |
| `kitefall.html` | **Kitefall** — kite-glider endless flyer prototype. Steer up/down, hold to curl into a ball and dive through cloud gaps. Not yet wired for any portal. |

## Monetization

`jetbreak.html` and `jetbreak-crazygames.html` are wired with **real** ad-portal
SDK calls (gameplay start/stop, an interstitial on our own "every 3rd death"
cadence, a rewarded "watch an ad to redeploy" continue). Each falls back to
harmless no-ops when the portal's SDK isn't present — so both are fully
playable standalone (local file, this repo, an Artifact preview) — and become
live, revenue-generating calls only once actually hosted on their matching
portal (`poki.com` / `crazygames.com` respectively).

No in-game banner strip in either build — portals place banner ads around the
game frame themselves; a banner drawn inside the canvas is against most
portals' submission guidelines.

Submitting to a **new** portal: copy `jetbreak.html`, swap its ad-portal
adapter block (`const Ads = ...`, near the top of the `<script>`) for that
portal's SDK shape, and use its script tag in place of the current one.

`kitefall.html` — and mobile app stores generally — still need real
integration before they'd earn anything: see conversation history for the
Capacitor + AdMob plan for the eventual mobile build.

## Status

`jetbreak.html`: ready for Poki submission.
`jetbreak-crazygames.html`: ready for CrazyGames submission.
Neither has actually been submitted/approved yet — that step needs a
developer account on each platform, which only the project owner can create.
