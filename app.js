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

// ---- Optional: Open Charge Map API key -----------------------------------
// The app works without a key, but Open Charge Map allows more requests per
// day if you register (free, no credit card) at https://openchargemap.org/site/loginproviders
// and paste your key between the quotes below. Leaving it blank is fine for V1.
const OCM_API_KEY = "";

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

const form = document.getElementById("trip-form");
const statusEl = document.getElementById("status");
const findBtn = document.getElementById("find-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the page from reloading on submit

  const startText = document.getElementById("start").value.trim();
  const destText = document.getElementById("destination").value.trim();
  const rangeMiles = document.getElementById("range").value; // not used for logic yet in V1

  setLoading(true);
  clearMap();

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
    drawChargers(chargers);

    if (chargers.length === 0) {
      setStatus(
        "Route found, but no chargers turned up nearby. Try a different route or zoom out to look around."
      );
    } else {
      setStatus(`Found ${chargers.length} charger${chargers.length === 1 ? "" : "s"} near your route.`);
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
function drawChargers(chargers) {
  chargers.forEach((charger) => {
    const info = charger.AddressInfo;
    if (!info || info.Latitude == null || info.Longitude == null) return;

    const marker = L.marker([info.Latitude, info.Longitude], {
      icon: chargerIcon,
    }).addTo(map);

    marker.bindPopup(buildPopupHtml(charger));
    chargerMarkers.push(marker);
  });
}

function buildPopupHtml(charger) {
  const info = charger.AddressInfo || {};
  const title = info.Title || "EV Charger";
  const address = [info.AddressLine1, info.Town, info.Postcode].filter(Boolean).join(", ");

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
      <p>${escapeHtml(connectionSummary)}</p>
    </div>
  `;
}

// A simple lightning-bolt style marker so chargers stand out from the route line.
const chargerIcon = L.divIcon({
  className: "charger-div-icon",
  html: "⚡",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

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
