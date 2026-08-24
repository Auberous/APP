# Minigames

Standalone, single-file HTML5 canvas prototypes — no build step, no dependencies.
Open any `.html` file directly in a browser to play.

| File | Game |
|---|---|
| `jetbreak.html` | **Jetbreak** — jetpack endless runner/level. Thrust, ball-roll, parachute burst, wingsuit rampage, helicopter/armor/extra-life power-ups, 4 escalating threat tiers, a ~3,000m extraction goal (Level 1: Burning City). |
| `kitefall.html` | **Kitefall** — kite-glider endless flyer. Steer up/down, hold to curl into a ball and dive through cloud gaps. |

## Monetization

Both games ship with **mocked** ad placements (a banner strip, an interstitial
every 3rd death, a rewarded "watch an ad to continue" prompt) — the UI/UX and
timing are real, but no ad SDK is wired in yet. Before publishing with real
ads, swap those mock placements for a real network:

- **Web** (itch.io / Poki / CrazyGames): the platform usually supplies its own
  ad SDK and wraps the game — check that platform's submission docs.
- **Mobile** (App Store / Google Play): wrap with [Capacitor](https://capacitorjs.com/)
  and integrate `@capacitor-community/admob`, or use Unity Ads if rebuilt in Unity.

## Status

Prototypes only — not yet wrapped for app store submission. See conversation
history for the Capacitor/AdMob integration plan and store submission checklist.
