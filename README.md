# EV Charger Route Planner (V1)

A simple webpage: opens centered on you (with permission) and your start
location pre-filled, like a normal navigation app. Type a destination, pick
one of a few route options, and see EV chargers plotted along it. Enter your
car's range and it becomes a route-planning advisor: pick from a few
charging-plan strategies, each showing the stops needed to actually complete
the trip.

## What's in this project

| File | What it does |
|---|---|
| `index.html` | The page structure — the form and the map area. |
| `style.css` | How things look. |
| `app.js` | The logic — looks up locations, gets a route, fetches chargers, draws pins. |

No installs, no build step, no server, no login. It's three plain files that
run entirely in your browser.

## How the pieces fit together

0. **On load**, the app asks your browser for permission to use your
   location. If you allow it, the map flies to where you are and "Start
   location" is pre-filled with a short place name (you can still overwrite
   it). If you say no, or your device doesn't support it, the app just
   quietly falls back to a default world view and you type a start location
   yourself — that's a normal outcome, not an error.
1. **You type** a start (or use the pre-filled one) and a destination, then
   click "Find Routes".
2. **Nominatim** (OpenStreetMap's free search) turns that text into map
   coordinates, and **OSRM** (a free routing service) finds a few genuinely
   different route options between them (however many it can find — often
   1-3) — each shown as a clickable box with its drive time and distance.
   All of them draw on the map right away too (via **Leaflet** and free
   **OpenStreetMap** map tiles), zoomed to fit — fastest in blue, the rest
   in grey, like a normal map app.
3. **You pick a route box.** That route's line turns bold blue (others fade
   to grey) and the map zooms to it, then **Open Charge Map** is asked
   "what chargers are near this route?" — each one gets a pin, and the
   status line above the map gives a quick breakdown, e.g. "Found 14
   chargers near this route (5 rapid, 7 fast, 2 slow)."
4. Each pin is **colored by charging speed or plug type** (whichever you pick
   with the toggle above the map) — a legend explains what the colors mean.
   Click any pin for the full details: address and every connector it has.
5. **If you entered a range**, a second row of boxes appears — 2-3 charging
   *strategies* for that specific route:
   - **Fewest stops** — jumps to the furthest reachable charger each time,
     "recharges" fully, and repeats. Minimizes how many times you stop.
   - **Fastest chargers** — same idea, but only considers rapid (100kW+)
     chargers, even if that means an extra stop.
   - **Extra buffer** — more conservative: decides you need a stop while
     you still have ~20% range left, rather than cutting it close.

   Pick a plan box to see that plan's stops as big numbered pins on the map,
   plus a written stop-by-stop plan above it (miles into the trip, miles
   since the last stop, and how much range you'll have left at the end).

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

- **"Near the route" is approximate.** Chargers are found by searching
  within 25 miles of points sampled every ~40 miles along your route —
  close to the actual road, but not a precise "chargers exactly on this
  road" search. The advisor's stop plan inherits this same approximation.
- **The plan assumes a full recharge at every stop**, and doesn't know
  anything about a charger's real-world reliability, wait times, or
  whether it was still operating recently — just that Open Charge Map has
  it listed with the right kind of connector.
- **If no charger is reachable partway through the trip**, the plan simply
  stops there with a plain warning message — it doesn't try alternate
  routes or search further afield to route around the gap.
- **Uses a free personal Open Charge Map key.** It's already set in
  `app.js` and rate limits are generous enough for one person's occasional
  use. If usage grows a lot, consider a paid/self-hosted routing service
  instead of the public OSRM demo server too.

## Natural next steps (V3 ideas — not built yet)

- Show distance/time to each charger from the route.
- Let you hide/filter out charger types you don't care about, not just color them.
- Smarter handling when the advisor can't fully plan a trip (e.g. suggest
  widening the search radius, or flag the exact gap on the map).
- Save/share a planned trip (would need some form of backend + accounts).

We can tackle these one at a time whenever you're ready.
