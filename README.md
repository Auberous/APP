# EV Charger Route Planner (V1)

A simple webpage: type a start location and destination, and see your driving
route with nearby EV chargers plotted on a map. Optionally enter your car's
range (not used for calculations yet in V1 — see "What's next" below).

## What's in this project

| File | What it does |
|---|---|
| `index.html` | The page structure — the form and the map area. |
| `style.css` | How things look. |
| `app.js` | The logic — looks up locations, gets a route, fetches chargers, draws pins. |

No installs, no build step, no server, no login. It's three plain files that
run entirely in your browser.

## How the pieces fit together

1. **You type** a start and destination.
2. **Nominatim** (OpenStreetMap's free search) turns that text into map
   coordinates.
3. **OSRM** (a free routing service) turns two coordinates into an actual
   driving route.
4. **Leaflet** draws the map and the route line, using free **OpenStreetMap**
   map tiles.
5. **Open Charge Map** is asked "what chargers are in the area around this
   route?" and each one gets a pin.
6. Each pin is **colored by charging speed or plug type** (whichever you pick
   with the toggle above the map) — a legend explains what the colors mean.
   Click any pin for the full details: address and every connector it has.

None of these services require you to sign up or pay for V1 — they're all
free, public APIs meant for exactly this kind of light personal use.

## How to try it out

**Easiest: just open the file.**
Double-click `index.html` and it'll open in your browser. This works in most
browsers, but a couple of browsers restrict background network requests when
a page is opened directly from disk (rather than a real web address). If the
map loads but searching doesn't work, use the local server option below.

**More reliable: run a tiny local server.**
If you have Python installed (most Macs do by default), open a terminal in
this folder and run:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

**Putting it online for real (free): GitHub Pages.**
Since this code lives in a GitHub repo already, GitHub can host it for free
at a public URL, no server needed. In the repo's Settings → Pages, set the
source to your branch and `/ (root)`. GitHub will give you a URL like
`https://yourusername.github.io/APP/`. I can walk you through this step when
you're ready — just say the word.

## Known V1 limitations (on purpose, to keep things simple)

- **Range isn't used yet.** You can enter your car's range, but the app
  doesn't yet check whether a charger is actually reachable or plan
  charging stops. It just shows chargers in the general area of your route.
- **"Near the route" is approximate.** It samples points every ~40 miles
  along your route and shows chargers within 25 miles of each one — close
  to the actual road, but not a precise "chargers exactly on this road"
  search.
- **Uses a free personal Open Charge Map key.** It's already set in
  `app.js` and rate limits are generous enough for one person's occasional
  use. If usage grows a lot, consider a paid/self-hosted routing service
  instead of the public OSRM demo server too.

## Natural next steps (V2 ideas — not built yet)

- **A charging "advisor"**: use your range to figure out which chargers you
  can actually reach and recommend a real charging plan, instead of just
  showing everything nearby. This is the next big feature planned.
- Show distance/time to each charger from the route.
- Let you hide/filter out charger types you don't care about, not just color them.
- Save/share a planned trip (would need some form of backend + accounts).

We can tackle these one at a time once V1 feels solid.
