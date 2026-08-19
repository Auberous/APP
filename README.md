# EV Charger Route Planner (V1)

A simple webpage: opens centered on you (with permission) and your start
location pre-filled, like a normal navigation app. Type a destination, pick
one of a few route options, and see EV chargers plotted along it. Enter your
car's range (miles or km, your choice) and it becomes a route-planning
advisor: pick from a few charging-plan strategies, each showing the stops
needed to actually complete the trip.

## What's in this project

| File | What it does |
|---|---|
| `index.html` | The page structure — the form and the map area. |
| `style.css` | How things look. |
| `app.js` | The logic — looks up locations, gets a route, fetches chargers, draws pins. |
| `brandLists.js` | Restaurant chain lists, shop brand lists, and example city-pair placeholders — all by country. |

No installs, no build step, no server, no login. It's four plain files that
run entirely in your browser.

## How the pieces fit together

0. **On load**, before anything needs your permission, the app guesses
   your country from two permission-free signals — your browser's own
   locale (instant) and a free IP-based lookup (arrives a moment later,
   and wins if it disagrees with the locale guess, since a locale can be
   wrong — e.g. a work laptop set to English (US) regardless of where it's
   actually used). That guess sets the initial map view (a rough view of
   your country, not a fixed US-centered default) and the starting lists
   in the brand pickers described below. It then *does* ask your browser
   for GPS permission — if you allow it, the map flies to your exact
   position and "Start location" is pre-filled with a short place name
   (you can still overwrite it), and GPS's country reading overrides the
   locale/IP guess too, being more precise. If you say no, or your device
   doesn't support it, the app quietly keeps the country-level guess and
   you type a start location yourself — a normal outcome, not an error.
   Whatever you actually type as your start location is the final word:
   once it's geocoded, its country overrides all of the above.
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
   Click any pin for the full details: address, every connector it has, and
   what's nearby — named restaurants/cafes, playgrounds, restrooms, and
   supermarkets/shops within the distance you set in the form (100m by
   default), each with its walking distance from the charger (e.g.
   "McDonald's — 350 ft"), fetched from OpenStreetMap's free **Overpass**
   service the moment you open that pin's popup (only once per charger;
   reopening the same popup later doesn't re-fetch it). Only the 3 nearest
   per category are listed, with a "+N more" note if there are others.
5. **If you entered a range**, a second row of boxes appears — charging
   *strategies* for that specific route:
   - **Fewest stops** — jumps to the furthest reachable charger each time,
     "recharges" fully, and repeats. Minimizes how many times you stop.
   - **Fastest chargers** — same idea, but only considers rapid (100kW+)
     chargers, even if that means an extra stop.
   - **Extra buffer** — more conservative: decides you need a stop while
     you still have ~20% range left, rather than cutting it close.
   - **Family-friendly stops** — only appears if you checked any "Prefer
     stops near" boxes in the form (restaurant/cafe, playground, restroom,
     shop) and set how far counts as "near" (100m by default — the same
     distance field also controls the popup's "what's nearby" section).
     Same idea as "Fewest stops", but at each step it checks a handful of
     the reachable chargers (furthest first) against Overpass and picks the
     first one that has *all* your checked amenities nearby. If none of
     the ones it checks qualify, it falls back to a normal stop there
     rather than leaving a gap — the plan tells you which stops matched.
     This one takes a moment longer to appear than the other 3, since it
     has to look each candidate up rather than just doing math.

   Pick a plan box to see that plan's stops as big numbered pins on the map,
   plus a written stop-by-stop plan above it. Each stop shows a compact row
   of stats — **Drive** (time + distance for that leg), **Charge**
   (estimated, from the leg's distance and the charger's top speed), **Wait**
   (always "Unknown" — Open Charge Map has no live wait-time data), and
   **To destination** (time + distance remaining) — plus its own "what's
   nearby" list (same named-amenities-with-walking-distance info as the map
   popups, shown inline here too). Drive/charge times are estimates from
   the route's overall average speed and a rough EV efficiency assumption,
   not real per-segment predictions — see the limitations below.
6. **Checking "Restaurant/Cafe" or "Shop" reveals a brand-picker panel**
   underneath it — pick particular chains/brands to narrow that category
   down to just those, instead of any restaurant/cafe or any shop. Shops
   are grouped into two tiers: **Quick stop** (supermarkets/convenience —
   Coles, Woolworths, 7-Eleven, etc.) and **Bigger break** (department/
   variety stores — Kmart, Target, Big W, etc.) — pick from either or both,
   they're combined into one filter. Which brands are listed depends on
   your detected country (see step 0 above for how that's guessed and
   refined — see `brandLists.js` for the lists, one entry per country with
   a `restaurants` array and a `shops` object). Picking brands actually
   narrows the live Overpass query itself (matched by name), not just a
   label — it affects both the popup's "what's nearby" list and the
   "Family-friendly stops" plan matching.
7. **The Start location/Destination example text is country-specific too**
   (e.g. "Sydney"/"Melbourne" for AU, "Austin"/"Dallas" for US) — same
   `brandLists.js` entries, same detected country, just placeholder text
   (never a real pre-filled value) so it doesn't show a US city pair
   regardless of where you are.

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
- **The mi/km toggle only affects what you see and type.** All the actual
  route/charging math internally works in miles regardless of which unit is
  selected — switching units just converts the number you typed and the
  numbers displayed back to you, instantly, without a new search.
- **"What's nearby" lists what OpenStreetMap has mapped, not a real
  recommendation.** It doesn't know quality, opening hours, or whether a
  place has actually closed down since it was last mapped — and some
  places on OSM don't have a name recorded, shown as "Unnamed restaurant"
  etc. rather than skipped. Overpass (the free service behind this) is also a shared
  public resource with light rate limits, similar to Nominatim — fine for
  occasional personal use, but the lookup can occasionally be slow or fail;
  if it does, the popup just says so rather than retrying automatically.
- **"Family-friendly stops" only checks a handful of candidates per stop**
  (up to 6, furthest-reachable first), not every charger near the route —
  checking all of them would mean dozens of extra Overpass lookups per
  search, which isn't a good trade against the free service's rate limits.
  In practice this means it usually finds a match quickly if one exists
  nearby, but it isn't an exhaustive search.
- **Chain/brand matching is a name search, not a verified database** — it
  matches whatever OpenStreetMap has in a place's "name" tag, so a
  misspelled or unusually-formatted listing could be missed, and it doesn't
  know about brands not yet in `brandLists.js` for your country (those fall
  back to a short internationally-common list, which may not fit).
- **Country detection is a best guess, refined over a few seconds, not a
  setting you control directly.** It starts from your browser's locale
  (instant but sometimes wrong — see step 0 above), then a free IP-lookup
  service ([ipapi.co](https://ipapi.co), no key needed, ~1,000 lookups/day
  on its free tier — plenty for personal use, but it's still a third-party
  service that could be slow, blocked by a network, or occasionally down),
  then GPS if you allow it, then your typed start location once you
  search. If both locale and the IP lookup fail (e.g. offline, or the
  service is unreachable), it falls back to a hardcoded default —
  currently Australia, `FALLBACK_COUNTRY_CODE` near the top of `app.js` —
  chosen as this app's primary market so far; a one-line change to swap it
  for another country.
- **The shop query now also looks for department/variety stores** (not
  just supermarkets/convenience like before), since that's the OSM tagging
  the "Bigger break" tier's brands (Kmart, Target, etc.) actually use. This
  slightly broadens what counts as "shop" everywhere, not just when brands
  are picked.
- **Drive/charge/remaining-time stats on each stop are estimates, not real
  predictions.** Drive and remaining time both use the route's *overall*
  average speed (total OSRM time ÷ total distance) applied to that leg's
  distance — a highway-heavy leg will actually be faster than this, a
  town-heavy one slower. Charge time assumes a flat ~3.5 mi/kWh efficiency
  and a linear charge rate at the charger's listed maximum speed — real
  charging tapers off (especially past ~80%) and real efficiency varies a
  lot by vehicle. Wait time is always "Unknown" — Open Charge Map is a
  static directory, not a live occupancy feed, so there's nothing to show.
- **Selecting a plan now fetches "what's nearby" for every one of its
  stops**, not just when you click a pin — for a typical 2-4 stop plan
  that's a few extra Overpass requests each time you pick or switch plans.
  Results are cached per charger (shared with the map popups), so revisiting
  the same plan or clicking a pin already shown in it is instant.
- **Debugging the amenity/brand search:** open the browser console (F12 →
  Console) — every amenity lookup logs the radius, the chain/shop brand
  list actually used, the raw Overpass query, and the counts that came
  back, so it's possible to see exactly what was searched for.

## Natural next steps (V3 ideas — not built yet)

- Show distance/time to each charger from the route.
- Let you hide/filter out charger types you don't care about, not just color them.
- Smarter handling when the advisor can't fully plan a trip (e.g. suggest
  widening the search radius, or flag the exact gap on the map).
- Save/share a planned trip (would need some form of backend + accounts).

We can tackle these one at a time whenever you're ready.
