/*
 * EV Charger Route Planner — V1
 *
 * What this file does, in order, every time you click "Find Route & Chargers":
 *   1. Turn the start/destination text you typed into map coordinates (geocoding).
 *   2. Ask a free routing service for driving directions between those two points.
 *   3. Draw that route as a line on the map.
 *   4. Ask Open Charge Map for EV chargers near that route.
 *   5. Drop a pin on the map for each charger found.
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
// Centered roughly on the middle of the US by default, zoomed out.
const map = L.map("map").setView([39.5, -98.35], 4);

// The map "tiles" (the actual picture of streets/land) come from OpenStreetMap,
// a free, community-maintained map — no API key needed.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// We'll keep track of the current route line and charger pins so we can
// remove them before drawing a new search.
let routeLayer = null;
let chargerMarkers = [];

// The most recent set of chargers found, kept around so switching the
// "color pins by" toggle can instantly recolor them without a new search.
let lastChargers = [];
let colorMode = "speed"; // "speed" or "plug"

const form = document.getElementById("trip-form");
const statusEl = document.getElementById("status");
const findBtn = document.getElementById("find-btn");
const legendEl = document.getElementById("legend");
const legendItemsEl = document.getElementById("legend-items");
const modeSpeedBtn = document.getElementById("mode-speed-btn");
const modePlugBtn = document.getElementById("mode-plug-btn");

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
  const rangeMiles = document.getElementById("range").value; // not used for logic yet in V1

  setLoading(true);
  clearMap();
  legendEl.hidden = true;

  try {
    // Step 1: turn addresses into coordinates
    setStatus(`Looking up "${startText}"...`);
    const startCoord = await geocode(startText);

    setStatus(`Looking up "${destText}"...`);
    const destCoord = await geocode(destText);

    // Step 2 + 3: get the driving route and draw it
    setStatus("Calculating route...");
    const route = await getRoute(startCoord, destCoord);
    drawRoute(route);

    // Step 4 + 5: find and draw chargers near the route
    setStatus("Finding EV chargers near your route...");
    const chargers = await getChargersNearRoute(route);
    lastChargers = chargers;
    drawChargers(chargers);

    if (chargers.length === 0) {
      setStatus(
        "Route found, but no chargers turned up nearby. Try a different route or zoom out to look around."
      );
      legendEl.hidden = true;
    } else {
      setStatus(`Found ${chargers.length} charger${chargers.length === 1 ? "" : "s"} near your route.`);
      legendEl.hidden = false;
      renderLegend();
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.", true);
  } finally {
    setLoading(false);
  }
});

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

// ---- Step 2: Routing (two coordinates -> a driving route) -----------------
// Uses OSRM's free public demo server. It's meant for testing/light use —
// if this app ever gets serious traffic, swap this for a paid routing service.
async function getRoute(startCoord, destCoord) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${startCoord.lon},${startCoord.lat};${destCoord.lon},${destCoord.lat}` +
    `?overview=full&geometries=geojson`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not reach the routing service. Please try again.");
  }

  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error("No driving route could be found between those two places.");
  }

  // GeoJSON coordinates come as [lon, lat] pairs; Leaflet wants [lat, lon].
  const coordinates = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);

  return {
    coordinates,
    distanceMeters: data.routes[0].distance,
  };
}

// ---- Step 3: Draw the route on the map -------------------------------------
function drawRoute(route) {
  routeLayer = L.polyline(route.coordinates, { color: "#1a73e8", weight: 5 }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
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

function buildPopupHtml(charger) {
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
function clearMap() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  chargerMarkers.forEach((m) => map.removeLayer(m));
  chargerMarkers = [];
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  findBtn.disabled = isLoading;
  findBtn.textContent = isLoading ? "Working..." : "Find Route & Chargers";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
