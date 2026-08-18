/*
 * EV Charger Route Planner — V1
 *
 * What this file does, in order:
 *   1. Click "Find Routes": turn the start/destination text into map
 *      coordinates (geocoding), then ask a free routing service for a
 *      few different route options between them.
 *   2. Those options show up as clickable boxes (drive time + distance).
 *      Pick one.
 *   3. That route is drawn on the map, and Open Charge Map is asked for
 *      EV chargers near it.
 *   4. If you entered a car range, a second row of boxes appears offering
 *      a few different charging-plan strategies for that route (the
 *      "advisor") — pick one to see its stops on the map and a written
 *      stop-by-stop plan. Plan stops get a big numbered pin; every other
 *      nearby charger gets a small colored dot.
 *
 * No server, no login, no database — everything happens right here in the browser.
 */

// ---- Open Charge Map API key -----------------------------------------------
// Open Charge Map now requires a registered key on requests (an unkeyed
// request gets rejected with HTTP 403). This is a free, rate-limit-only key
// tied to a personal Open Charge Map account — it's not a secret and it's
// fine for it to be visible here in a public repo.
const OCM_API_KEY = "73d5a487-00e9-40c6-b804-6210f537899b";

// ---- Set up the map --------------------------------------------------------
// Starts zoomed out on a rough world view so the map isn't blank while we
// wait on the location permission prompt below — initUserLocation() flies
// it to your actual location as soon as (and if) you allow that.
const map = L.map("map").setView([39.5, -98.35], 4);

// The map "tiles" (the actual picture of streets/land) come from OpenStreetMap,
// a free, community-maintained map — no API key needed.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// We'll keep track of the route lines and charger pins so we can remove
// them before drawing a new search. routeLayers holds one line per route
// option, same order as currentRoutes, so they can be restyled in place.
let routeLayers = [];
let chargerMarkers = [];

// The most recent set of chargers found, kept around so switching the
// "color pins by" toggle can instantly recolor them without a new search.
let lastChargers = [];
let colorMode = "speed"; // "speed" or "plug"

// Charging-plan state: the pins for recommended stops are kept separate from
// the regular charger pins, and we remember which charger IDs are "stops" so
// the regular pin for that same charger isn't drawn twice in the same spot.
let planMarkers = [];
let currentPlanStopIds = new Set();

// Route-options and plan-options state (the two rows of clickable boxes).
// A search finds up to a few different routes; picking one finds chargers
// and (if you gave a range) a few different charging-plan strategies for
// that specific route.
let currentRoutes = [];
let selectedRouteIndex = -1;
let hasRangeForSearch = false;
let rangeMilesForSearch = 0;
let planStrategies = [];
let selectedPlanKey = null;

const form = document.getElementById("trip-form");
const startInput = document.getElementById("start");
const statusEl = document.getElementById("status");
const findBtn = document.getElementById("find-btn");
const routePickerEl = document.getElementById("route-picker");
const routeOptionsEl = document.getElementById("route-options");
const planPickerEl = document.getElementById("plan-picker");
const planOptionsEl = document.getElementById("plan-options");
const planEl = document.getElementById("plan");
const planContentEl = document.getElementById("plan-content");
const legendEl = document.getElementById("legend");
const legendItemsEl = document.getElementById("legend-items");
const modeSpeedBtn = document.getElementById("mode-speed-btn");
const modePlugBtn = document.getElementById("mode-plug-btn");

// ---- Find the user and start there, like Google Maps does -----------------
// On load, ask the browser for permission to use your location. If you say
// yes, the map flies to you instead of sitting on a default world view, and
// "Start location" is pre-filled with a short place name for where you are
// (you can still overwrite it to start from somewhere else). If you say no,
// or your browser/device doesn't support this, the app just quietly falls
// back to the default view — that's a normal choice, not an error.
function initUserLocation() {
  if (!("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      map.flyTo([latitude, longitude], 11);

      try {
        startInput.value = await reverseGeocode(latitude, longitude);
      } catch (err) {
        console.error(err);
        startInput.value = "My Location";
      }
    },
    (err) => {
      console.info("Location not available:", err.message);
      setStatus("Type a start location below, or allow location access next time to skip that step.");
    },
    { timeout: 8000 }
  );
}

// Turns coordinates into a short, human-friendly place name (e.g.
// "Bundeena, New South Wales") using Nominatim's free reverse-geocoding —
// the same free service used for the forward lookups elsewhere in this file.
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Reverse geocoding failed");

  const data = await response.json();
  const addr = data.address || {};
  const place = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || addr.county;
  const region = addr.state || addr.country;
  const label = [place, region].filter(Boolean).join(", ");

  return label || data.display_name || "My Location";
}

initUserLocation();

modeSpeedBtn.addEventListener("click", () => setColorMode("speed"));
modePlugBtn.addEventListener("click", () => setColorMode("plug"));

function setColorMode(mode) {
  colorMode = mode;
  modeSpeedBtn.setAttribute("aria-pressed", String(mode === "speed"));
  modePlugBtn.setAttribute("aria-pressed", String(mode === "plug"));
  renderLegend();
  redrawChargerMarkers();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the page from reloading on submit

  const startText = document.getElementById("start").value.trim();
  const destText = document.getElementById("destination").value.trim();
  const rangeValue = parseFloat(document.getElementById("range").value);
  hasRangeForSearch = Number.isFinite(rangeValue) && rangeValue > 0;
  rangeMilesForSearch = rangeValue;

  setLoading(true);
  clearEverything();
  routePickerEl.hidden = true;
  planPickerEl.hidden = true;
  legendEl.hidden = true;
  planEl.hidden = true;
  selectedRouteIndex = -1;
  selectedPlanKey = null;

  try {
    // Step 1: turn addresses into coordinates
    setStatus(`Looking up "${startText}"...`);
    const startCoord = await geocode(startText);

    setStatus(`Looking up "${destText}"...`);
    const destCoord = await geocode(destText);

    // Step 2: find a few different route options between them
    setStatus("Calculating route options...");
    currentRoutes = await getRoutes(startCoord, destCoord);

    // Step 3: preview every route option on the map right away (fastest in
    // blue, alternates in grey, like a normal map app), zoomed to fit them
    // all. Finding chargers/planning (steps 4-5) waits for you to actually
    // pick one — see selectRoute() below.
    renderRouteOptions(currentRoutes);
    drawRouteOptions(currentRoutes);
    setStatus(
      currentRoutes.length > 1
        ? `Found ${currentRoutes.length} route options — pick one below.`
        : "Found a route — select it below to continue."
    );
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.", true);
  } finally {
    setLoading(false);
  }
});

// Runs once you click one of the route boxes: highlights that route line,
// finds chargers near it, and (if you gave a range) works out charging-plan
// options for it.
async function selectRoute(index) {
  selectedRouteIndex = index;
  markSelectedCard(routeOptionsEl, (_, i) => i === index);

  const route = currentRoutes[index];

  // The picked route's line goes bold blue; every other option's line
  // becomes grey, whether or not it was the "fastest" one shown by default.
  routeLayers.forEach((layer, i) => layer.setStyle(routeLineStyle(i === index)));
  routeLayers[index].bringToFront();
  map.fitBounds(routeLayers[index].getBounds(), { padding: [40, 40] });

  clearChargersAndPlan(); // wipes chargers/plan pins from a previously picked route
  planPickerEl.hidden = true;
  planEl.hidden = true;
  legendEl.hidden = true;
  selectedPlanKey = null;

  setLoading(true);

  try {
    // Step 4: find chargers near the route
    setStatus("Finding EV chargers near this route...");
    const chargers = await getChargersNearRoute(route);
    lastChargers = chargers;

    // Step 4b: if a range was given, work out a few different charging-plan
    // strategies and let the plan-picker boxes handle drawing pins for
    // whichever one is selected (starting with the first, "Fewest stops").
    if (hasRangeForSearch) {
      setStatus("Working out charging plan options...");
      planStrategies = buildPlanStrategies(chargers, route, rangeMilesForSearch);
      renderPlanOptions(planStrategies);
      selectPlanStrategy(planStrategies[0].key);
    } else {
      // Step 5: no range given, so just draw every nearby charger.
      drawChargers(chargers);
    }

    if (chargers.length === 0) {
      setStatus("Route found, but no chargers turned up nearby. Try a different route option.");
    } else {
      const breakdown = summarizeChargerSpeeds(chargers);
      setStatus(
        `Found ${chargers.length} charger${chargers.length === 1 ? "" : "s"} near this route` +
          (breakdown ? ` (${breakdown})` : "") +
          "."
      );
      legendEl.hidden = false;
      renderLegend();
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong finding chargers. Please try again.", true);
  } finally {
    setLoading(false);
  }
}

// Runs when you click one of the plan-strategy boxes: swaps which set of
// stops is drawn on the map and described in the written plan below.
function selectPlanStrategy(key) {
  selectedPlanKey = key;
  markSelectedCard(planOptionsEl, (child) => child.dataset.planKey === key);

  const strategy = planStrategies.find((s) => s.key === key);
  if (!strategy) return;

  planMarkers.forEach((m) => map.removeLayer(m));
  planMarkers = [];
  currentPlanStopIds = new Set(strategy.result.stops.map((s) => s.charger.ID));

  drawPlanStops(strategy.result.stops);
  renderPlan(strategy.result);
  redrawChargerMarkers(); // regular charger dots must skip whichever chargers are now "stops"
}

// Toggles a "selected" look onto whichever card in a picker matches, and
// clears it from the rest. matchFn(cardElement, index) => true/false.
function markSelectedCard(container, matchFn) {
  Array.from(container.children).forEach((child, i) => {
    child.classList.toggle("selected", matchFn(child, i));
  });
}

// ---- Step 1: Geocoding (address text -> coordinates) ----------------------
// Uses Nominatim, OpenStreetMap's free search service. No API key required,
// but please don't hammer it with requests (fine for a personal app like this).
async function geocode(placeText) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(placeText);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not reach the location lookup service. Please try again.");
  }

  const results = await response.json();
  if (results.length === 0) {
    throw new Error(`Couldn't find a location matching "${placeText}". Try being more specific.`);
  }

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
  };
}

// ---- Step 2: Routing (two coordinates -> a few driving route options) -----
// Uses OSRM's free public demo server, asking for alternative routes as well
// as the fastest one. Routing services only ever find a handful of genuinely
// different paths between two points — sometimes just one — so however many
// come back is however many route boxes get shown (capped at 3).
async function getRoutes(startCoord, destCoord) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${startCoord.lon},${startCoord.lat};${destCoord.lon},${destCoord.lat}` +
    `?overview=full&geometries=geojson&alternatives=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not reach the routing service. Please try again.");
  }

  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error("No driving route could be found between those two places.");
  }

  const routes = data.routes.map((r) => ({
    // GeoJSON coordinates come as [lon, lat] pairs; Leaflet wants [lat, lon].
    coordinates: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceMeters: r.distance,
    durationSeconds: r.duration,
  }));

  routes.sort((a, b) => a.durationSeconds - b.durationSeconds);
  return routes.slice(0, 3);
}

// Fills in the route-picker boxes: one per route option, showing drive time
// and distance, fastest first.
function renderRouteOptions(routes) {
  routeOptionsEl.innerHTML = "";

  routes.forEach((route, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-card";
    btn.innerHTML = `
      <div class="option-title">${i === 0 ? "Fastest" : `Route ${i + 1}`}</div>
      <div class="option-detail">${formatDuration(route.durationSeconds)} · ${formatMiles(
        route.distanceMeters
      )}</div>
    `;
    btn.addEventListener("click", () => selectRoute(i));
    routeOptionsEl.appendChild(btn);
  });

  routePickerEl.hidden = false;
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatMiles(meters) {
  return `${Math.round(meters * MILES_PER_METER)} mi`;
}

// ---- Step 3: Draw every route option on the map, like a normal map app ----
// The fastest option starts highlighted in blue and the rest in grey, all
// visible at once and zoomed to fit — selectRoute() re-styles them once you
// actually pick one.
function drawRouteOptions(routes) {
  routeLayers = routes.map((route, i) => L.polyline(route.coordinates, routeLineStyle(i === 0)).addTo(map));

  const allPoints = routes.flatMap((route) => route.coordinates);
  map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
}

function routeLineStyle(isHighlighted) {
  return isHighlighted
    ? { color: "#1a73e8", weight: 6, opacity: 0.95 }
    : { color: "#9e9e9e", weight: 4, opacity: 0.7 };
}

// ---- Step 4: Find chargers near the route ----------------------------------
// V1 keeps the *logic* simple (no range/reachability planning yet), but the
// search itself walks the actual route: we drop sample points every ~40
// miles along the line and ask Open Charge Map for chargers within a radius
// of each one, then combine the results. This uses Open Charge Map's most
// standard "point + radius" search, which is more reliable than a single
// big rectangle around a long, winding route.
const MILES_PER_METER = 1 / 1609.34;
const SAMPLE_SPACING_MILES = 40;
const SEARCH_RADIUS_MILES = 25;
const MAX_SAMPLE_POINTS = 12;

async function getChargersNearRoute(route) {
  const samplePoints = pickSamplePoints(route);

  const requests = samplePoints.map((point) => fetchChargersNear(point));
  const results = await Promise.allSettled(requests);

  const chargersById = new Map();
  let anySucceeded = false;

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      anySucceeded = true;
      result.value.forEach((charger) => chargersById.set(charger.ID, charger));
    } else {
      console.error("Open Charge Map request failed:", result.reason);
    }
  });

  if (!anySucceeded) {
    // Every single request failed — surface the actual reason from the first
    // failure so it's possible to tell "no internet", "rate limited", etc. apart.
    const firstFailure = results.find((r) => r.status === "rejected");
    throw new Error(
      `Could not reach Open Charge Map: ${firstFailure.reason.message}. Please try again.`
    );
  }

  return Array.from(chargersById.values());
}

// Picks evenly-spaced points along the route line, roughly one every
// SAMPLE_SPACING_MILES, capped at MAX_SAMPLE_POINTS so we don't fire off an
// unreasonable number of requests for very long trips.
function pickSamplePoints(route) {
  const distanceMiles = route.distanceMeters * MILES_PER_METER;
  const desiredCount = Math.ceil(distanceMiles / SAMPLE_SPACING_MILES) + 1;
  const count = Math.min(Math.max(desiredCount, 2), MAX_SAMPLE_POINTS);

  const coords = route.coordinates;
  const points = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * (coords.length - 1)) / (count - 1));
    const [lat, lon] = coords[index];
    points.push({ lat, lon });
  }
  return points;
}

async function fetchChargersNear(point) {
  const params = new URLSearchParams({
    output: "json",
    compact: "true",
    verbose: "false",
    maxresults: "100",
    latitude: String(point.lat),
    longitude: String(point.lon),
    distance: String(SEARCH_RADIUS_MILES),
    distanceunit: "miles",
  });
  if (OCM_API_KEY) params.set("key", OCM_API_KEY);

  const url = `https://api.openchargemap.io/v3/poi/?${params.toString()}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkErr) {
    throw new Error("network error reaching Open Charge Map");
  }

  if (!response.ok) {
    throw new Error(`Open Charge Map returned an error (HTTP ${response.status})`);
  }

  return response.json();
}

// ---- Step 4b: Plan which chargers to actually stop at -----------------------
// Given your range, this works out the fewest stops needed to complete the
// trip: at each point, it jumps to the furthest-away charger that's still
// within reach, then "recharges" (assumes a full charge at every stop) and
// repeats. That's the standard way to solve "minimum stops to cover a
// distance" — it always finds the smallest possible number of stops.
const ROUTE_INDEX_MAX_POINTS = 400;

// A route can have thousands of GPS points; for planning we only need a
// lighter-weight version with a running "miles from start" at each point,
// so we can tell how far along the route any given charger sits.
function buildRouteIndex(route) {
  const coords = route.coordinates;
  const step = Math.max(1, Math.floor(coords.length / ROUTE_INDEX_MAX_POINTS));

  let prev = L.latLng(coords[0][0], coords[0][1]);
  const index = [{ latlng: prev, cumMiles: 0 }];
  let cumMiles = 0;

  for (let i = step; i < coords.length; i += step) {
    const point = L.latLng(coords[i][0], coords[i][1]);
    cumMiles += prev.distanceTo(point) * MILES_PER_METER;
    index.push({ latlng: point, cumMiles });
    prev = point;
  }

  const last = L.latLng(coords[coords.length - 1][0], coords[coords.length - 1][1]);
  if (!prev.equals(last)) {
    cumMiles += prev.distanceTo(last) * MILES_PER_METER;
    index.push({ latlng: last, cumMiles });
  }

  return index;
}

// Finds how far along the route (in miles) a charger sits, by finding the
// closest point on the route to it. Also returns how far off the route it
// is (a charger right next to the highway vs. a mile down a side road).
function locateChargerOnRoute(charger, routeIndex) {
  const point = L.latLng(charger.AddressInfo.Latitude, charger.AddressInfo.Longitude);

  let nearest = routeIndex[0];
  let nearestMeters = point.distanceTo(nearest.latlng);

  for (let i = 1; i < routeIndex.length; i++) {
    const meters = point.distanceTo(routeIndex[i].latlng);
    if (meters < nearestMeters) {
      nearestMeters = meters;
      nearest = routeIndex[i];
    }
  }

  return {
    milesAlongRoute: nearest.cumMiles,
    detourMiles: nearestMeters * MILES_PER_METER,
  };
}

// reachRangeMiles is the range used to decide when a stop is needed —
// normally your real range, but the "Extra buffer" strategy passes in a
// reduced number here so it stops sooner/more often. trueRangeMiles is
// always your *real* range, used only to work out actual remaining range
// at the destination (a full recharge always gives you the real range back,
// regardless of how conservatively the stop timing was decided).
function planChargingStops(chargers, route, reachRangeMiles, trueRangeMiles = reachRangeMiles) {
  const routeIndex = buildRouteIndex(route);
  const totalMiles = routeIndex[routeIndex.length - 1].cumMiles;

  const candidates = chargers
    .filter((c) => c.AddressInfo?.Latitude != null && c.AddressInfo?.Longitude != null)
    .map((charger) => ({ charger, ...locateChargerOnRoute(charger, routeIndex) }))
    .sort((a, b) => a.milesAlongRoute - b.milesAlongRoute);

  const stops = [];
  let position = 0;
  let reachable = true;
  let stuckAtMiles = null;

  while (position + reachRangeMiles < totalMiles) {
    const inReach = candidates.filter(
      (c) => c.milesAlongRoute > position && c.milesAlongRoute <= position + reachRangeMiles
    );

    if (inReach.length === 0) {
      reachable = false;
      stuckAtMiles = position;
      break;
    }

    // Greedy pick: whichever reachable charger gets us furthest, so we need
    // the fewest total stops.
    const next = inReach.reduce((best, c) => (c.milesAlongRoute > best.milesAlongRoute ? c : best));
    stops.push(next);
    position = next.milesAlongRoute;
  }

  return {
    stops,
    totalMiles,
    reachable,
    stuckAtMiles,
    spareMiles: reachable ? position + trueRangeMiles - totalMiles : null,
  };
}

// The 3 charging-plan strategies offered as plan-picker boxes. All 3 reuse
// the exact same planning function above — they just feed it different
// charger lists or a different (temporarily reduced) range.
const BUFFER_SAFETY_MARGIN = 0.8; // "Extra buffer" plans as if only 80% of range is usable per leg

function buildPlanStrategies(chargers, route, rangeMiles) {
  const rapidOnly = chargers.filter((c) => getSpeedCategory(c).key === "rapid");

  return [
    { key: "fewest", label: "Fewest stops", result: planChargingStops(chargers, route, rangeMiles) },
    { key: "fastest", label: "Fastest chargers", result: planChargingStops(rapidOnly, route, rangeMiles) },
    {
      key: "buffer",
      label: "Extra buffer",
      result: planChargingStops(chargers, route, rangeMiles * BUFFER_SAFETY_MARGIN, rangeMiles),
    },
  ];
}

// Fills in the plan-picker boxes: one per strategy, showing how many stops
// it needs (or that it isn't fully possible on this route).
function renderPlanOptions(strategies) {
  planOptionsEl.innerHTML = "";

  strategies.forEach((strategy) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-card";
    btn.dataset.planKey = strategy.key;

    const stopCount = strategy.result.stops.length;
    const detail = !strategy.result.reachable
      ? "Not fully possible on this route"
      : stopCount === 0
      ? "No stops needed"
      : `${stopCount} stop${stopCount === 1 ? "" : "s"}`;

    btn.innerHTML = `
      <div class="option-title">${escapeHtml(strategy.label)}</div>
      <div class="option-detail">${escapeHtml(detail)}</div>
    `;
    btn.addEventListener("click", () => selectPlanStrategy(strategy.key));
    planOptionsEl.appendChild(btn);
  });

  planPickerEl.hidden = false;
}

function renderPlan(planResult) {
  const { stops, totalMiles, reachable, stuckAtMiles, spareMiles } = planResult;

  if (stops.length === 0 && reachable) {
    planContentEl.innerHTML = `<p>This plan needs no charging stops — you can complete the ~${Math.round(
      totalMiles
    )}-mile trip on your current charge! 🎉</p>`;
    planEl.hidden = false;
    return;
  }

  const items = stops
    .map((stop, i) => {
      const title = stop.charger.AddressInfo?.Title || "EV Charger";
      const legMiles = i === 0 ? stop.milesAlongRoute : stop.milesAlongRoute - stops[i - 1].milesAlongRoute;
      return `<li><strong>Stop ${i + 1}: ${escapeHtml(title)}</strong> — about ${Math.round(
        stop.milesAlongRoute
      )} miles into the trip (${Math.round(legMiles)} miles since the last stop)</li>`;
    })
    .join("");

  const footer = reachable
    ? `<p>Arrive at your destination with roughly ${Math.round(spareMiles)} miles of range to spare.</p>`
    : `<p class="plan-warning">⚠️ Could only plan stops up to about mile ${Math.round(
        stuckAtMiles
      )} of ${Math.round(totalMiles)} — no charger was found within range after that point.</p>`;

  planContentEl.innerHTML = `<ol>${items}</ol>${footer}`;
  planEl.hidden = false;
}

function drawPlanStops(stops) {
  stops.forEach((stop, i) => {
    const info = stop.charger.AddressInfo;
    const marker = L.marker([info.Latitude, info.Longitude], {
      icon: makeStopIcon(i + 1),
      zIndexOffset: 1000,
    }).addTo(map);

    marker.bindPopup(buildPopupHtml(stop.charger, `Recommended charging stop #${i + 1}`));
    planMarkers.push(marker);
  });
}

function makeStopIcon(number) {
  return L.divIcon({
    className: "stop-div-icon",
    html: `<span>${number}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// ---- Step 5: Draw charger pins on the map ----------------------------------

// Speed categories, checked from fastest to slowest — a charger is placed in
// the first category its fastest connector qualifies for.
const SPEED_CATEGORIES = [
  { key: "rapid", label: "Rapid (100kW+)", color: "#d32f2f", minKW: 100 },
  { key: "fast", label: "Fast (20–99kW)", color: "#f57c00", minKW: 20 },
  { key: "slow", label: "Slow (under 20kW)", color: "#1976d2", minKW: 0 },
];
const SPEED_UNKNOWN = { key: "unknown", label: "Speed unknown", color: "#757575" };

// Plug/connector categories. A charging site often has several connector
// types; we pick the single "best" one present (in this priority order) to
// represent and color the whole site, since that keeps one pin = one color.
const PLUG_CATEGORIES = {
  ccs: { label: "CCS", color: "#1976d2" },
  chademo: { label: "CHAdeMO", color: "#8e24aa" },
  tesla: { label: "Tesla", color: "#e53935" },
  type2: { label: "Type 2", color: "#43a047" },
  type1: { label: "Type 1 (J1772)", color: "#00897b" },
};
const PLUG_UNKNOWN = { key: "unknown", label: "Other / unknown", color: "#757575" };
const PLUG_PRIORITY = ["ccs", "chademo", "tesla", "type2", "type1"];

function getMaxPowerKW(charger) {
  if (!Array.isArray(charger.Connections)) return null;
  const powers = charger.Connections.map((c) => c.PowerKW).filter((kw) => typeof kw === "number");
  return powers.length > 0 ? Math.max(...powers) : null;
}

function getSpeedCategory(charger) {
  const maxKW = getMaxPowerKW(charger);
  if (maxKW == null) return SPEED_UNKNOWN;
  return SPEED_CATEGORIES.find((cat) => maxKW >= cat.minKW) || SPEED_UNKNOWN;
}

// Quick at-a-glance breakdown of a set of chargers by speed, e.g.
// "5 rapid, 7 fast, 2 slow" — used in the status line so you don't have to
// click every pin just to see what's available.
function summarizeChargerSpeeds(chargers) {
  const counts = {};
  chargers.forEach((charger) => {
    const key = getSpeedCategory(charger).key;
    counts[key] = (counts[key] || 0) + 1;
  });

  return [...SPEED_CATEGORIES, SPEED_UNKNOWN]
    .filter((cat) => counts[cat.key] > 0)
    .map((cat) => `${counts[cat.key]} ${cat.key === "unknown" ? "unknown speed" : cat.key}`)
    .join(", ");
}

function classifyConnectionTitle(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("ccs")) return "ccs";
  if (t.includes("chademo")) return "chademo";
  if (t.includes("tesla")) return "tesla";
  if (t.includes("type 2") || t.includes("type2")) return "type2";
  if (t.includes("type 1") || t.includes("j1772")) return "type1";
  return null;
}

function getPlugCategory(charger) {
  if (!Array.isArray(charger.Connections)) return PLUG_UNKNOWN;

  const present = new Set(
    charger.Connections.map((c) => classifyConnectionTitle(c.ConnectionType?.Title)).filter(Boolean)
  );
  const bestKey = PLUG_PRIORITY.find((key) => present.has(key));
  return bestKey ? { key: bestKey, ...PLUG_CATEGORIES[bestKey] } : PLUG_UNKNOWN;
}

function getMarkerCategory(charger) {
  return colorMode === "plug" ? getPlugCategory(charger) : getSpeedCategory(charger);
}

function drawChargers(chargers) {
  chargers.forEach((charger) => {
    const info = charger.AddressInfo;
    if (!info || info.Latitude == null || info.Longitude == null) return;
    if (currentPlanStopIds.has(charger.ID)) return; // already shown as a numbered plan stop

    const color = getMarkerCategory(charger).color;
    const marker = L.marker([info.Latitude, info.Longitude], {
      icon: makeChargerIcon(color),
    }).addTo(map);

    marker.bindPopup(buildPopupHtml(charger));
    chargerMarkers.push(marker);
  });
}

// Removes and redraws the charger pins from the last search results, using
// the current colorMode. Used when the "color pins by" toggle changes, so
// switching modes is instant and doesn't need a new Open Charge Map request.
function redrawChargerMarkers() {
  chargerMarkers.forEach((m) => map.removeLayer(m));
  chargerMarkers = [];
  drawChargers(lastChargers);
}

function buildPopupHtml(charger, note) {
  const info = charger.AddressInfo || {};
  const title = info.Title || "EV Charger";
  const address = [info.AddressLine1, info.Town, info.Postcode].filter(Boolean).join(", ");

  const speed = getSpeedCategory(charger);
  const plug = getPlugCategory(charger);

  let connectionSummary = "Connector info not available";
  if (Array.isArray(charger.Connections) && charger.Connections.length > 0) {
    connectionSummary = charger.Connections
      .map((c) => {
        const type = c.ConnectionType?.Title || "Unknown connector";
        const power = c.PowerKW ? `${c.PowerKW}kW` : "";
        return [type, power].filter(Boolean).join(" ");
      })
      .join(", ");
  }

  return `
    <div class="charger-popup">
      <h3>${escapeHtml(title)}</h3>
      ${note ? `<p class="stop-note">${escapeHtml(note)}</p>` : ""}
      ${address ? `<p>${escapeHtml(address)}</p>` : ""}
      <div class="badges">
        <span class="badge" style="background:${speed.color}">${escapeHtml(speed.label)}</span>
        <span class="badge" style="background:${plug.color}">${escapeHtml(plug.label)}</span>
      </div>
      <p class="connector-list">${escapeHtml(connectionSummary)}</p>
    </div>
  `;
}

// Builds a colored circular pin (a lightning bolt on a colored disc) for a
// given hex color, so the same icon shape works for either color mode.
function makeChargerIcon(color) {
  return L.divIcon({
    className: "charger-div-icon",
    html: `<span style="background:${color}">⚡</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Fills in the legend panel to match the current colorMode.
function renderLegend() {
  const categories = colorMode === "plug"
    ? [...PLUG_PRIORITY.map((key) => ({ key, ...PLUG_CATEGORIES[key] })), PLUG_UNKNOWN]
    : [...SPEED_CATEGORIES, SPEED_UNKNOWN];

  legendItemsEl.innerHTML = categories
    .map(
      (cat) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${cat.color}"></span>
          ${escapeHtml(cat.label)}
        </span>
      `
    )
    .join("");
}

// ---- Helpers ----------------------------------------------------------------

// Removes just the charger and plan pins — used when switching between
// route options, since the route lines themselves should stay put (just
// restyled) rather than disappear and redraw.
function clearChargersAndPlan() {
  chargerMarkers.forEach((m) => map.removeLayer(m));
  chargerMarkers = [];
  planMarkers.forEach((m) => map.removeLayer(m));
  planMarkers = [];
  currentPlanStopIds = new Set();
}

// Wipes the whole map — route lines included — used at the start of a
// brand-new search.
function clearEverything() {
  routeLayers.forEach((l) => map.removeLayer(l));
  routeLayers = [];
  clearChargersAndPlan();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  findBtn.disabled = isLoading;
  findBtn.textContent = isLoading ? "Working..." : "Find Routes";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
