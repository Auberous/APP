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
| `brandLists.js` | Restaurant chain lists, shop brand lists, example city-pair placeholders, and default units — all by country. |

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
   chargers near this route (5 rapid, 7 fast, 2 slow)." At this same moment,
   the app also quietly starts looking up "what's nearby" for every one of
   those chargers in the background (see the "preloading" limitation below)
   — so by the time you actually open a pin or pick a charging plan, that
   info is usually already sitting there ready, instead of you watching
   "Checking what's nearby..." for a few seconds.
4. Each pin is **colored by charging speed or plug type** (whichever you pick
   with the toggle above the map) — a legend explains what the colors mean.
   Click any pin for the full details: address, every connector it has, and
   what's nearby — named restaurants/cafes, playgrounds, restrooms, and
   supermarkets/shops within the distance you set in the form (100m by
   default), each with its walking distance from the charger (e.g.
   "McDonald's — 350 ft"), fetched from OpenStreetMap's free **Overpass**
   service — usually already preloaded by step 3 above, but fetched on the
   spot if not (only once per charger either way; reopening the same popup
   later doesn't re-fetch it). Only the 3 nearest
   per category are listed, with a "+N more" note if there are others.
5. **If you entered a range**, a second row of boxes appears — charging
   *strategies* for that specific route:
   - **Fewest stops** — jumps to the furthest reachable charger each time,
     "recharges" fully, and repeats. Minimizes how many times you stop.
   - **Fastest chargers** — same idea, but only considers rapid (100kW+)
     chargers, even if that means an extra stop.
   - **Extra buffer** — more conservative: decides you need a stop while
     you still have ~20% range left, rather than cutting it close.
   - **Family-friendly stops** (and up to 2 more boxes alongside it) — only
     appears if you checked any "Prefer stops near" boxes in the form (food,
     playground, restroom, shop) and set how far counts as "near" (100m by
     default — the same distance field also controls the popup's "what's
     nearby" section). Same idea as "Fewest stops", but at each step it
     checks a handful of the reachable chargers (furthest first) against
     Overpass and picks the first one that has *all* your checked amenities
     nearby.
     - **"Family-friendly stops"** uses your exact typed distance (100m by
       default). If a match exists that close everywhere on the route,
       this is the only one of these boxes you'll see.
     - If it can't find a match that close for every stop, a 2nd box
       appears — **"Family-friendly (up to ~500m)"** (5x your typed
       distance) — the same search, just allowed to look further before
       giving up on a stop.
     - If that still can't match everywhere, a 3rd box appears —
       **"Family-friendly (best within ~2km)"** (20x your typed distance,
       capped at 5km total either way) — one more, wider attempt.
     Whichever box(es) you see, if none of the checked candidates qualify
     at that box's distance, it falls back to a normal stop there rather
     than leaving a gap — the written plan tells you which stops matched
     and, for a match, exactly how close ("✅ matched within 350 ft").
     These boxes take a moment longer to appear than the other 3, since
     each has to look candidates up rather than just doing math — but every
     candidate at a stop, and all 3 distance tiers, are checked *at once*
     rather than one at a time, so normally this is one short wait (as long
     as the single slowest of everything being checked) rather than many
     stacked back to back (see the limitations below for how the
     underlying data is also cached/shared, and time-limited so a slow
     reply can't hang indefinitely). **If you checked a "Prefer stops near" box, no *plan* is
     shown at all until this check finishes** — deliberately, so you're
     never shown "Fewest stops" (which knows nothing about your amenity
     preference) and end up mistaking it for the real recommendation, or
     picking a stop you wouldn't have actually chosen. (The map's regular
     charger pins still appear right away, same as always — it's only the
     numbered, recommended-stop plan that waits, not the underlying
     charger data.) A small notice ("🔍 Finding the best stop near your
     preferred amenities...") appears in the plan's place while that's in
     progress; once it's done, the plan panel fills in directly with the
     best result found — you don't have to notice and click a box
     yourself. If you didn't check any
     "Prefer stops near" box, none of this applies — the plan appears
     immediately as soon as it's picked, same as always.
   - **Changing your mind after a plan is already showing works the same
     way, automatically.** If a route's already picked and you then check
     (or uncheck) "Food", tick a specific chain like McDonald's, pick a
     shop brand, or adjust the "within" distance, the plan re-checks itself
     against the new preference right away — no need to press "Find
     Routes" again, since nothing about the route or the chargers on it
     actually changed, only what you're looking for near them. The same
     "🔍 Finding the best stop..." notice appears while that's happening,
     and the plan updates in place once it's done. Unchecking every
     "Prefer stops near" box falls back to the plain "Fewest stops" plan.
     A few quick clicks in a row (e.g. ticking two chains back to back)
     are debounced into one re-check rather than one per click.

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
6. **Checking "Food" or "Shop" reveals a brand-picker panel** underneath
   it — pick particular chains/brands to narrow that category down to
   just those, instead of any restaurant/cafe or any shop. Shops
   are grouped into two tiers: **Quick stop** (supermarkets/convenience —
   Coles, Woolworths, 7-Eleven, etc.) and **Bigger break** (department/
   variety stores — Kmart, Target, Big W, etc.) — pick from either or both,
   they're combined into one filter. Which brands are listed depends on
   your detected country (see step 0 above for how that's guessed and
   refined — see `brandLists.js` for the lists, one entry per country with
   a `restaurants` array and a `shops` object). Picking brands genuinely
   changes what counts as a match for "Family-friendly stops" — but the
   "what's nearby" list itself (popups and plan stops both) still shows
   *everything* nearby in that category, not just your picks: whichever
   ones actually match your picks are bolded with a ⭐, and if none of
   what's nearby matches, a small note says so ("None of these match your
   pick — closest is 850 ft away") instead of the list just going blank.
   That way you can always see for yourself what's really around a
   charger, not just trust a bare "no match" verdict. Each brand row in
   the picker also shows that brand's real logo (fetched live by domain —
   see the limitations below), not just a generic icon, so chains in the
   same category are easy to tell apart at a glance.
7. **The Start location/Destination example text is country-specific too**
   (e.g. "Sydney"/"Melbourne" for AU, "Austin"/"Dallas" for US) — same
   `brandLists.js` entries, same detected country, just placeholder text
   (never a real pre-filled value) so it doesn't show a US city pair
   regardless of where you are.
8. **The mi/km and m/ft toggles also default from the detected country**
   (metric for AU/GB/NZ/CA, imperial for US and anywhere undetected) —
   but only as a *default*. The moment you click either toggle yourself,
   that one stops following country updates (e.g. if the IP lookup
   resolves a moment after you'd already switched it) — it's genuinely
   your choice from then on, not something that can flip back on you.

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
  etc. rather than skipped. Overpass (the free service behind this) is also
  a shared public resource with light rate limits, similar to Nominatim —
  fine for occasional personal use, but the lookup can occasionally be slow
  or fail, especially with several checks in flight at once (the
  background preload, a plan, a Family-friendly tier check, and — since
  those now all run in parallel rather than one at a time — potentially a
  fair few requests at once for a single search). Every lookup is capped
  client-side at 10 seconds (not just Overpass's own internal query
  timeout, which only bounds its side, not however long the reply takes to
  arrive) and retries once automatically after a short pause before giving
  up — if it still fails after that, the popup/plan says so rather than
  retrying further. In a densely-mapped area, a wide search can occasionally
  still take the full 10 seconds simply because there's a lot of ground (and
  data) to cover.
- **"Family-friendly stops" only checks a handful of candidates per stop**
  (up to 6, furthest-reachable first), not every charger near the route —
  checking all of them would mean dozens of extra Overpass lookups per
  search, which isn't a good trade against the free service's rate limits.
  Those 6, and all 3 distance tiers, are now all checked at the same time
  rather than one after another (previously tiers ran one after another,
  each only starting once the last had fully finished or failed — now
  they're fired together, so the worst case is one wait for whichever is
  slowest instead of the 3 stacked back to back). This is faster but does
  mean a wider tier's lookups happen even when the strict one turns out to
  match everywhere and the wider tier's box never actually gets shown. It
  still isn't an exhaustive search either way: if none of the 6 candidates
  checked have a match, the plan doesn't keep looking further down the
  list of reachable chargers.
- **The 3 "Family-friendly" distance tiers are fixed multiples** (1x, 5x,
  20x your typed "within" distance, capped at 5km total) — not something
  you can currently set yourself. Checking a charger against a wider tier
  is its own Overpass request (a wider search can find things a narrower
  one legitimately wouldn't have), but every request result is cached and
  shared everywhere else in the app that asks about that same charger at
  that same distance — a map pin, a plan stop, and the background preload
  all reuse one fetch rather than tripling it.
- **Chain/brand matching is a name search, not a verified database** — it
  checks whether OpenStreetMap's "name" tag for a place *contains* one of
  your picked brand names (case-insensitive, so "mcdonald's family
  restaurant" still matches "McDonald's"), so a genuinely misspelled or
  very differently-formatted listing could still be missed, and it doesn't
  know about brands not yet in `brandLists.js` for your country (those fall
  back to a short internationally-common list, which may not fit). This
  matching now happens after the Overpass fetch, not as part of the query
  itself — every restaurant/cafe and every shop in range is fetched either
  way, so the "what's nearby" list can show what's actually around a
  charger even when nothing matches your specific pick, and the Overpass
  query is very slightly larger per request as a result (fetching a whole
  category instead of a name-filtered slice of it).
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
  the same plan or clicking a pin already shown in it is instant — *until*
  you change what you're looking for (see the live-update note above),
  which deliberately clears that cache for every charger on the route, so
  the next check/click is a fresh, correctly-filtered lookup rather than a
  leftover answer from before you changed your mind.
- **Debugging the amenity/brand search:** open the browser console (F12 →
  Console) — every amenity lookup logs the radius, the chain/shop brand
  list actually used, the raw Overpass query, and the counts that came
  back, so it's possible to see exactly what was searched for.
- **"What's nearby" is preloaded in the background** for every charger the
  moment a route is picked, 3 chargers at a time, rather than waiting until
  you open a pin or select a plan — so it's usually instant when you get
  there. Whichever amenity checks actually decide what you're shown first
  — the plan you land on if you didn't check a "Prefer stops near" box, or
  the family-friendly candidate checks if you did — are requested before
  this general preload starts, so they get first claim on the browser's
  connection pool rather than queuing behind chargers that turn out not to
  matter. On a slow connection, or right after a big route with lots of
  chargers, a map pin you click directly may still briefly show "Checking
  what's nearby..." before its own request finishes. This also means a route with a lot of chargers now
  sends a burst of extra Overpass requests up front even for chargers you
  never end up looking at, which is a fair trade for occasional personal
  use but worth knowing about since Overpass is a shared free service (see
  the rate-limit note above). If you pick a different route before an
  earlier route's preload finishes, that stale preload quietly stops
  itself rather than wasting further requests on chargers you're no longer
  looking at. Every amenity request anywhere in the app (a pin, a plan
  stop, preload, a Family-friendly tier check) shares one cache per
  charger-and-distance, so the same lookup is never fetched twice even if
  several of these ask about it around the same moment.
- **Brand logos are fetched live from a free logo-by-domain service**
  (Clearbit's logo API), using the `domain` recorded for each brand in
  `brandLists.js` — not files stored in this project. Two things worth
  knowing: (1) those domains are a best-effort mapping I wrote, not
  independently verified against each company's actual site — if one's
  wrong, it's a one-line fix in `brandLists.js`, and the only effect of a
  wrong/dead domain is that one logo quietly falls back to plain text (the
  brand name still works fine for search, since that always uses `name`,
  never `domain`). (2) These are each company's real trademarked logos,
  fetched and displayed without their involvement — fine for personal,
  non-commercial use like this, but worth knowing if this app is ever
  shown publicly at scale or monetized, since trademark owners can object
  to that kind of use. I'm not a lawyer and this isn't legal advice — just
  flagging it honestly.

## Natural next steps (V3 ideas — not built yet)

- Show distance/time to each charger from the route.
- Let you hide/filter out charger types you don't care about, not just color them.
- Smarter handling when the advisor can't fully plan a trip (e.g. suggest
  widening the search radius, or flag the exact gap on the map).
- Save/share a planned trip (would need some form of backend + accounts).

We can tackle these one at a time whenever you're ready.
