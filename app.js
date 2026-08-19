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

// ---- Guess a starting country before anything else renders -----------------
// The very first paint (map view, brand-picker lists) needs *some* country
// to assume, before there's been any chance to ask for GPS permission or
// look anything up. This uses only signals that need no permission prompt:
// the browser's own locale first (instant, but can be wrong — e.g. a
// company laptop imaged with English (US) as the OS language regardless of
// where it's actually used), refined moments later by a permission-free
// IP-based lookup (see detectCountryFromIP() below), refined again by GPS
// if you grant it, and finally overridden by wherever "Start location" gets
// geocoded to once you search — each of those is more trustworthy than the
// last, so later signals win over earlier ones (see setDetectedCountry()).
const FALLBACK_COUNTRY_CODE = "AU"; // used only if even the locale guess comes back empty

const COUNTRY_MAP_VIEWS = {
  AU: { center: [-25.27, 133.78], zoom: 4 },
  US: { center: [39.5, -98.35], zoom: 4 },
  GB: { center: [54.5, -3.0], zoom: 5 },
  NZ: { center: [-41.5, 173.0], zoom: 5 },
  CA: { center: [56.0, -106.0], zoom: 3 },
};
const DEFAULT_MAP_VIEW = { center: [20, 0], zoom: 2 }; // whole-world view for a country we don't have a view for

function getMapViewForCountry(countryCode) {
  return (countryCode && COUNTRY_MAP_VIEWS[countryCode]) || DEFAULT_MAP_VIEW;
}

function guessCountryFromLocale() {
  const locale = navigator.language || (navigator.languages && navigator.languages[0]);
  const region = locale && locale.split("-")[1];
  return region ? region.toUpperCase() : null;
}

// Tracks both the current best guess and how confident it is, so a slower
// but weaker signal (e.g. IP lookup, if it resolves late) can never
// overwrite a stronger one that already arrived (e.g. GPS). Tiers, weakest
// to strongest: 0 locale guess, 1 IP-based lookup, 2 GPS, 3 geocoded start
// location. See setDetectedCountry() further down, where this is enforced.
let detectedCountryCode = guessCountryFromLocale() || FALLBACK_COUNTRY_CODE;
let detectedCountryTier = 0;

// Set to true once the map has been precisely centered on a real location
// (your GPS position) — once that's happened, a country-level "rough view"
// update (from a same-or-lower-tier signal) shouldn't yank the map back
// out to a whole-country zoom.
let mapCenteredPrecisely = false;

// ---- Set up the map --------------------------------------------------------
// Starts on a rough view of the guessed country above so the map isn't
// blank/wrong-country while we wait on everything else — initUserLocation()
// flies it to your actual location as soon as (and if) you allow that.
const initialMapView = getMapViewForCountry(detectedCountryCode);
const map = L.map("map").setView(initialMapView.center, initialMapView.zoom);

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
let preferredAmenitiesForSearch = []; // amenity keys checked in the form, e.g. ["restaurant","playground"]
let preferredChainsForSearch = []; // specific chain names checked, e.g. ["McDonald's","KFC"] — narrows "restaurant"
let preferredShopBrandsForSearch = []; // specific shop names checked (both tiers combined) — narrows "shop"
let planStrategies = [];
let selectedPlanKey = null;

// Which unit distances are typed in and displayed in. All the actual
// planning math elsewhere in this file works in miles regardless — this
// only affects what you type/read, converting at the edges.
let distanceUnit = "mi"; // "mi" or "km"
const KM_PER_MILE = 1.60934;

const form = document.getElementById("trip-form");
const startInput = document.getElementById("start");
const destinationInput = document.getElementById("destination");
const rangeInput = document.getElementById("range");
const rangeLabelEl = document.getElementById("range-label");
const unitMiBtn = document.getElementById("unit-mi-btn");
const unitKmBtn = document.getElementById("unit-km-btn");
const amenityCheckboxes = document.querySelectorAll('.amenity-check input[type="checkbox"]');
const amenityDistanceInput = document.getElementById("amenity-distance");
const amenityUnitMBtn = document.getElementById("amenity-unit-m-btn");
const amenityUnitFtBtn = document.getElementById("amenity-unit-ft-btn");
const amenityRestaurantCheckbox = document.getElementById("amenity-restaurant");
const chainPickerEl = document.getElementById("chain-picker");
const chainChecksEl = document.getElementById("chain-checks");
const amenityShopCheckbox = document.getElementById("amenity-shop");
const shopPickerEl = document.getElementById("shop-picker");
const shopQuickStopChecksEl = document.getElementById("shop-quickstop-checks");
const shopBiggerBreakChecksEl = document.getElementById("shop-biggerbreak-checks");
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

// Tracks whether you've manually picked a unit yourself, so a later country
// refinement (e.g. IP lookup resolving after the locale guess) only ever
// sets the *default* — it never overrides a choice you already made.
let distanceUnitManuallySet = false;
let amenityDistanceUnitManuallySet = false;

unitMiBtn.addEventListener("click", () => {
  distanceUnitManuallySet = true;
  setDistanceUnit("mi");
});
unitKmBtn.addEventListener("click", () => {
  distanceUnitManuallySet = true;
  setDistanceUnit("km");
});

function setDistanceUnit(unit) {
  distanceUnit = unit;
  unitMiBtn.setAttribute("aria-pressed", String(unit === "mi"));
  unitKmBtn.setAttribute("aria-pressed", String(unit === "km"));
  rangeLabelEl.textContent = `Car range in ${unit} (optional)`;
  rangeInput.placeholder = unit === "mi" ? "e.g. 250" : "e.g. 400";

  // If route/plan boxes or the written plan are already showing, refresh
  // their text so distances switch units immediately — no new search needed.
  if (currentRoutes.length > 0) {
    renderRouteOptions(currentRoutes);
    if (selectedRouteIndex !== -1) {
      markSelectedCard(routeOptionsEl, (_, i) => i === selectedRouteIndex);
    }
  }
  if (selectedPlanKey) {
    const strategy = planStrategies.find((s) => s.key === selectedPlanKey);
    if (strategy) renderPlan(strategy.result);
  }
}

// Distances from OSRM/route math arrive in meters or miles depending on
// where they came from — these two helpers both output a unit-aware string
// like "254 mi" or "409 km", so the display always matches the toggle above.
function formatDistanceFromMeters(meters) {
  const miles = meters * MILES_PER_METER;
  return distanceUnit === "km" ? `${Math.round(miles * KM_PER_MILE)} km` : `${Math.round(miles)} mi`;
}

function formatDistanceFromMiles(miles) {
  return distanceUnit === "km" ? `${Math.round(miles * KM_PER_MILE)} km` : `${Math.round(miles)} mi`;
}

// The "within ___ of these amenities" distance — separate from the mi/km
// trip-range toggle above since this one is a short, walking-scale distance
// (meters/feet suit it better than miles/km). Read at submit time into
// amenityDistanceMetersForSearch, which every amenity lookup uses.
let amenityDistanceUnit = "m"; // "m" or "ft"
let amenityDistanceMetersForSearch = 100; // overwritten on submit; matches the form's default

amenityUnitMBtn.addEventListener("click", () => {
  amenityDistanceUnitManuallySet = true;
  setAmenityDistanceUnit("m");
});
amenityUnitFtBtn.addEventListener("click", () => {
  amenityDistanceUnitManuallySet = true;
  setAmenityDistanceUnit("ft");
});

function setAmenityDistanceUnit(unit) {
  amenityDistanceUnit = unit;
  amenityUnitMBtn.setAttribute("aria-pressed", String(unit === "m"));
  amenityUnitFtBtn.setAttribute("aria-pressed", String(unit === "ft"));
}

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
      mapCenteredPrecisely = true; // set before flyTo/setDetectedCountry so no rough country-view fights this
      map.flyTo([latitude, longitude], 11);

      try {
        const result = await reverseGeocode(latitude, longitude);
        startInput.value = result.label;
        setDetectedCountry(result.countryCode, 2);
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
// "Bundeena, New South Wales") plus a country code, using Nominatim's free
// reverse-geocoding — the same free service used for the forward lookups
// elsewhere in this file.
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Reverse geocoding failed");

  const data = await response.json();
  const addr = data.address || {};
  const place = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || addr.county;
  const region = addr.state || addr.country;
  const label = [place, region].filter(Boolean).join(", ");

  return {
    label: label || data.display_name || "My Location",
    countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
  };
}

// ---- Which country's chain list to show in the "specific chains" picker ---
// Updates the detected country, but only if the new signal is at least as
// trustworthy as whatever set the current guess (see the tier comment
// above, near where detectedCountryCode is first set) — so e.g. a slow-to-
// resolve IP lookup can't undo a GPS fix that already arrived. Re-renders
// the brand pickers, and — for the weaker, pre-search signals only — nudges
// the map to a rough view of the new country, unless GPS has already
// centered it precisely (a country-level view would be a downgrade then).
function setDetectedCountry(countryCode, tier) {
  if (!countryCode || tier < detectedCountryTier) return;

  const countryChanged = countryCode !== detectedCountryCode;
  detectedCountryCode = countryCode;
  detectedCountryTier = tier;
  renderChainChecks();
  renderShopChecks();
  renderPlaceholders();
  renderUnitsDefault();

  if (countryChanged && tier < 3 && !mapCenteredPrecisely) {
    const view = getMapViewForCountry(countryCode);
    map.flyTo(view.center, view.zoom);
  }
}

// A free, permission-free IP-based lookup — a cross-check for the locale
// guess above, since a browser/OS locale doesn't always match where you
// actually are (e.g. a work laptop set to English (US) while used
// anywhere else). No prompt, unlike GPS: it just asks a public service
// "what country does this connection look like it's coming from".
async function detectCountryFromIP() {
  try {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.country_code) {
      setDetectedCountry(data.country_code.toUpperCase(), 1);
    }
  } catch (err) {
    // Not a real problem — the locale guess already in place, and GPS or
    // the start location later, both still work fine without this.
    console.info("IP-based country detection unavailable:", err.message);
  }
}

// Looks up one country's brand lists, falling back to BRAND_LISTS_DEFAULT
// (from brandLists.js) for any country not in there.
function getBrandListsForCountry(countryCode) {
  return (countryCode && BRAND_LISTS_BY_COUNTRY[countryCode]) || BRAND_LISTS_DEFAULT;
}

// Fills in a set of brand checkboxes into `container`, preserving whichever
// ones are already checked if the list is rebuilt after a country change
// (in case any of the same names appear in both). Shared by both the
// restaurant chain picker and each tier of the shop brand picker — same
// component, just handed a different list and container each time.
//
// Each checkbox shows the brand's real logo, fetched live from a free
// logo-by-domain service (no images hosted by this app), plus its name.
// The name is what's actually searched for — the logo is just a visual
// aid, so a wrong/dead domain only means a missing picture: the image's
// onerror hides it and the text name (always present) carries on fine.
function renderBrandChecklist(container, brands) {
  const previouslyChecked = new Set(
    Array.from(container.querySelectorAll("input:checked")).map((cb) => cb.value)
  );

  container.innerHTML = brands
    .map((brand) => {
      const logoUrl = `https://logo.clearbit.com/${encodeURIComponent(brand.domain)}?size=32`;
      return `
        <label class="chain-check">
          <input type="checkbox" value="${escapeHtml(brand.name)}" ${
        previouslyChecked.has(brand.name) ? "checked" : ""
      } />
          <img class="brand-logo" src="${logoUrl}" alt="" onerror="this.style.display='none'" />
          ${escapeHtml(brand.name)}
        </label>
      `;
    })
    .join("");
}

function renderChainChecks() {
  renderBrandChecklist(chainChecksEl, getBrandListsForCountry(detectedCountryCode).restaurants);
}

function renderShopChecks() {
  const shops = getBrandListsForCountry(detectedCountryCode).shops;
  renderBrandChecklist(shopQuickStopChecksEl, shops.quickStop);
  renderBrandChecklist(shopBiggerBreakChecksEl, shops.biggerBreak);
}

// Swaps the Start/Destination example text (placeholder only — never the
// actual value) for a city pair from the detected country, so a US example
// like "Austin"/"Dallas" doesn't show up regardless of where you are.
function renderPlaceholders() {
  const placeholders = getBrandListsForCountry(detectedCountryCode).placeholders;
  startInput.placeholder = `e.g. ${placeholders.start}`;
  destinationInput.placeholder = `e.g. ${placeholders.destination}`;
}

// Sets the mi/km and m/ft toggles to the detected country's usual units —
// but only the ones you haven't already clicked yourself. This only ever
// sets a *default*; once you manually pick a unit, later country
// refinements (IP lookup resolving after the locale guess, etc.) leave it
// alone, per how setDetectedCountry() re-runs this on every update.
function renderUnitsDefault() {
  const units = getBrandListsForCountry(detectedCountryCode).units;

  if (!distanceUnitManuallySet) {
    setDistanceUnit(units === "metric" ? "km" : "mi");
  }
  if (!amenityDistanceUnitManuallySet) {
    setAmenityDistanceUnit(units === "metric" ? "m" : "ft");
  }
}

amenityRestaurantCheckbox.addEventListener("change", () => {
  chainPickerEl.hidden = !amenityRestaurantCheckbox.checked;
});

amenityShopCheckbox.addEventListener("change", () => {
  shopPickerEl.hidden = !amenityShopCheckbox.checked;
});

renderChainChecks();
renderShopChecks();
renderPlaceholders();
renderUnitsDefault();
detectCountryFromIP();
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

  const startText = startInput.value.trim();
  const destText = destinationInput.value.trim();
  const rangeValue = parseFloat(rangeInput.value);
  hasRangeForSearch = Number.isFinite(rangeValue) && rangeValue > 0;
  // Planning math elsewhere in this file always works in miles, so convert
  // here if you typed the range in km.
  rangeMilesForSearch = hasRangeForSearch ? (distanceUnit === "km" ? rangeValue / KM_PER_MILE : rangeValue) : 0;
  preferredAmenitiesForSearch = Array.from(amenityCheckboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  // Which chain checkboxes are checked is read after the start location is
  // geocoded below (not here), in case that corrects the detected country
  // and changes which chains are even listed.

  const amenityDistanceValue = parseFloat(amenityDistanceInput.value);
  amenityDistanceMetersForSearch =
    Number.isFinite(amenityDistanceValue) && amenityDistanceValue > 0
      ? amenityDistanceUnit === "ft"
        ? amenityDistanceValue / 3.28084
        : amenityDistanceValue
      : 100; // fall back to the default if left blank/invalid

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
    setDetectedCountry(startCoord.countryCode, 3); // most authoritative signal — overrides locale/IP/GPS guesses
    // Both only apply while their parent checkbox is checked — the brand
    // checkboxes stay in the DOM (hidden) when it's unchecked, so this
    // guards against a stale selection filtering results after someone's
    // turned the parent preference off.
    preferredChainsForSearch = amenityRestaurantCheckbox.checked
      ? Array.from(chainChecksEl.querySelectorAll("input:checked")).map((cb) => cb.value)
      : [];
    preferredShopBrandsForSearch = amenityShopCheckbox.checked
      ? Array.from(shopPickerEl.querySelectorAll("input:checked")).map((cb) => cb.value)
      : [];

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

    // Kick off "what's nearby" lookups for every charger right away, in the
    // background — not awaited, so it doesn't hold up anything below. By
    // the time you actually click a pin or pick a charging plan, the
    // amenity info is usually already cached and appears instantly instead
    // of showing "Checking what's nearby..." for a few seconds. See
    // preloadAmenities() for how it stays polite to Overpass's rate limits.
    preloadAmenities(chargers);

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
      setStatus(chargerFoundStatus(chargers));
      legendEl.hidden = false;
      renderLegend();
    }

    // A 4th plan box, "Family-friendly stops", only appears if at least one
    // amenity preference was checked. It's built after the other 3 since it
    // has to check candidates against Open Street Map data one at a time,
    // which takes a moment longer than the instant math the rest use.
    if (hasRangeForSearch && preferredAmenitiesForSearch.length > 0 && chargers.length > 0) {
      setStatus("Checking nearby amenities for a family-friendly option...");
      const familyStrategy = await buildFamilyStrategy(
        chargers,
        route,
        rangeMilesForSearch,
        preferredAmenitiesForSearch
      );
      planStrategies.push(familyStrategy);
      renderPlanOptions(planStrategies);
      markSelectedCard(planOptionsEl, (child) => child.dataset.planKey === selectedPlanKey);
      setStatus(chargerFoundStatus(chargers));
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
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=" +
    encodeURIComponent(placeText);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not reach the location lookup service. Please try again.");
  }

  const results = await response.json();
  if (results.length === 0) {
    throw new Error(`Couldn't find a location matching "${placeText}". Try being more specific.`);
  }

  const countryCode = results[0].address?.country_code;
  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    countryCode: countryCode ? countryCode.toUpperCase() : null,
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
      <div class="option-detail">${formatDuration(route.durationSeconds)} · ${formatDistanceFromMeters(
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

// Turns a charger list into candidates ordered by how far along the route
// they sit — the shared starting point for every planning strategy below.
function buildCandidates(chargers, routeIndex) {
  return chargers
    .filter((c) => c.AddressInfo?.Latitude != null && c.AddressInfo?.Longitude != null)
    .map((charger) => ({ charger, ...locateChargerOnRoute(charger, routeIndex) }))
    .sort((a, b) => a.milesAlongRoute - b.milesAlongRoute);
}

// reachRangeMiles is the range used to decide when a stop is needed —
// normally your real range, but the "Extra buffer" strategy passes in a
// reduced number here so it stops sooner/more often. trueRangeMiles is
// always your *real* range, used only to work out actual remaining range
// at the destination (a full recharge always gives you the real range back,
// regardless of how conservatively the stop timing was decided).
// A rough average speed for the whole route (from OSRM's own time/distance
// for it), used to turn "how far into the trip" a stop is into "how long
// it'll take to get there" — an estimate, not a real per-segment timing.
function estimateAvgMph(route) {
  if (!route.durationSeconds) return null;
  const miles = route.distanceMeters * MILES_PER_METER;
  const hours = route.durationSeconds / 3600;
  return hours > 0 ? miles / hours : null;
}

function planChargingStops(chargers, route, reachRangeMiles, trueRangeMiles = reachRangeMiles) {
  const routeIndex = buildRouteIndex(route);
  const totalMiles = routeIndex[routeIndex.length - 1].cumMiles;
  const candidates = buildCandidates(chargers, routeIndex);

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
    avgMph: estimateAvgMph(route),
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

// The 4th, optional strategy: prefer stops near the amenities you checked
// (restaurant/playground/restroom/shop). Same "fewest stops" logic as
// above, but at each step it checks a bounded number of the reachable
// candidates (furthest first) against Open Street Map's amenity data and
// picks the first one that has all your chosen amenities nearby. If none
// of the checked candidates qualify, it falls back to the plain furthest-
// reachable charger — same as "Fewest stops" — rather than leaving a gap
// in the plan, and that stop is marked as not matched so the plan is
// honest about it.
const MAX_AMENITY_CHECKS_PER_STOP = 6;

async function buildFamilyStrategy(chargers, route, rangeMiles, preferredAmenities) {
  const routeIndex = buildRouteIndex(route);
  const totalMiles = routeIndex[routeIndex.length - 1].cumMiles;
  const candidates = buildCandidates(chargers, routeIndex);

  const stops = [];
  let position = 0;
  let reachable = true;
  let stuckAtMiles = null;
  let allStopsMatched = true;

  while (position + rangeMiles < totalMiles) {
    const inReach = candidates
      .filter((c) => c.milesAlongRoute > position && c.milesAlongRoute <= position + rangeMiles)
      .sort((a, b) => b.milesAlongRoute - a.milesAlongRoute); // furthest first, like the other strategies

    if (inReach.length === 0) {
      reachable = false;
      stuckAtMiles = position;
      break;
    }

    let chosen = null;
    for (const candidate of inReach.slice(0, MAX_AMENITY_CHECKS_PER_STOP)) {
      if (await candidateMatchesAmenities(candidate.charger, preferredAmenities)) {
        chosen = candidate;
        chosen.amenityMatch = true;
        break;
      }
    }

    if (!chosen) {
      chosen = inReach[0]; // fall back to the furthest reachable charger, no gap left in the plan
      chosen.amenityMatch = false;
      allStopsMatched = false;
    }

    stops.push(chosen);
    position = chosen.milesAlongRoute;
  }

  return {
    key: "family",
    label: "Family-friendly stops",
    result: {
      stops,
      totalMiles,
      reachable,
      stuckAtMiles,
      spareMiles: reachable ? position + rangeMiles - totalMiles : null,
      avgMph: estimateAvgMph(route),
      allStopsMatched,
    },
  };
}

// Checks (and caches, on the charger itself) whether a charger has every
// one of the preferred amenities within the same radius used everywhere
// else in the app. A failed lookup counts as "no match" rather than
// stopping the whole plan.
async function candidateMatchesAmenities(charger, preferredAmenities) {
  if (!charger._amenityInfo) {
    try {
      charger._amenityInfo = await fetchNearbyAmenities(
        charger.AddressInfo.Latitude,
        charger.AddressInfo.Longitude,
        amenityDistanceMetersForSearch,
        preferredChainsForSearch,
        preferredShopBrandsForSearch
      );
    } catch (err) {
      console.error("Amenity check failed for a candidate charger:", err);
      return false;
    }
  }
  return preferredAmenities.every((key) => charger._amenityInfo[key].count > 0);
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
    let detail;
    if (!strategy.result.reachable) {
      detail = "Not fully possible on this route";
    } else if (stopCount === 0) {
      detail = "No stops needed";
    } else if (strategy.key === "family") {
      const matched = strategy.result.stops.filter((s) => s.amenityMatch).length;
      detail =
        matched === stopCount
          ? `${stopCount} stop${stopCount === 1 ? "" : "s"} — all match!`
          : `${stopCount} stop${stopCount === 1 ? "" : "s"} (${matched} match)`;
    } else {
      detail = `${stopCount} stop${stopCount === 1 ? "" : "s"}`;
    }

    btn.innerHTML = `
      <div class="option-title">${escapeHtml(strategy.label)}</div>
      <div class="option-detail">${escapeHtml(detail)}</div>
    `;
    btn.addEventListener("click", () => selectPlanStrategy(strategy.key));
    planOptionsEl.appendChild(btn);
  });

  planPickerEl.hidden = false;
}

// Rough EV efficiency used only to turn "miles since the last stop" into
// an estimated charge time. Real efficiency varies a lot by vehicle, and
// real charging isn't linear (it tapers, especially above ~80%) — this is
// a simple estimate, clearly labeled "~" in the UI, not a real prediction.
const EV_EFFICIENCY_MI_PER_KWH = 3.5;

function renderPlan(planResult) {
  const { stops, totalMiles, reachable, stuckAtMiles, spareMiles, avgMph } = planResult;

  if (stops.length === 0 && reachable) {
    planContentEl.innerHTML = `<p>This plan needs no charging stops — you can complete the ~${formatDistanceFromMiles(
      totalMiles
    )} trip on your current charge! 🎉</p>`;
    planEl.hidden = false;
    return;
  }

  const items = stops
    .map((stop, i) => {
      const title = stop.charger.AddressInfo?.Title || "EV Charger";
      const legMiles = i === 0 ? stop.milesAlongRoute : stop.milesAlongRoute - stops[i - 1].milesAlongRoute;
      const remainingMiles = totalMiles - stop.milesAlongRoute;

      const amenityNote =
        stop.amenityMatch === true
          ? " · ✅ near your preferred amenities"
          : stop.amenityMatch === false
          ? " · ⚠️ no matching amenities found nearby"
          : "";

      // Drive time/remaining time are estimated from the route's overall
      // average speed — not a real per-segment timing — so they're rough,
      // especially on routes with very different highway vs. town sections.
      const driveStat =
        avgMph > 0
          ? `${formatDuration((legMiles / avgMph) * 3600)} · ${formatDistanceFromMiles(legMiles)}`
          : "Unknown";
      const remainingStat =
        avgMph > 0
          ? `${formatDuration((remainingMiles / avgMph) * 3600)} · ${formatDistanceFromMiles(remainingMiles)}`
          : "Unknown";

      const maxKW = getMaxPowerKW(stop.charger);
      const chargeStat =
        maxKW > 0
          ? `~${formatDuration(((legMiles / EV_EFFICIENCY_MI_PER_KWH) / maxKW) * 3600)}`
          : "Unknown (charger speed not listed)";

      // Open Charge Map is a static directory, not a live status feed — it
      // has no wait-time/occupancy data, so this is always "unknown" today
      // rather than a fabricated number. Shown anyway so it's not a silent
      // gap in the stat row.
      const waitStat = "Unknown (not available from this data source)";

      return `
        <li class="stop-item">
          <div class="stop-header"><strong>Stop ${i + 1}: ${escapeHtml(title)}</strong>${amenityNote}</div>
          <div class="stop-stats">
            <span class="stat"><span class="stat-label">Drive</span>${driveStat}</span>
            <span class="stat"><span class="stat-label">Charge</span>${chargeStat}</span>
            <span class="stat"><span class="stat-label">Wait</span>${waitStat}</span>
            <span class="stat"><span class="stat-label">To destination</span>${remainingStat}</span>
          </div>
          <div class="stop-amenities" data-stop-charger-id="${stop.charger.ID}">🔍 Checking what's nearby…</div>
        </li>
      `;
    })
    .join("");

  const footer = reachable
    ? `<p>Arrive at your destination with roughly ${formatDistanceFromMiles(spareMiles)} of range to spare.</p>`
    : `<p class="plan-warning">⚠️ Could only plan stops up to about ${formatDistanceFromMiles(
        stuckAtMiles
      )} of ${formatDistanceFromMiles(totalMiles)} — no charger was found within range after that point.</p>`;

  planContentEl.innerHTML = `<ol class="stop-list">${items}</ol>${footer}`;
  planEl.hidden = false;

  loadStopAmenitiesForPlan(stops);
}

// Fetches (and caches, on each charger object — shared with the map-pin
// popups) the same "what's nearby" info for every stop in the currently
// displayed plan, filling each stop's placeholder in as it resolves.
async function loadStopAmenitiesForPlan(stops) {
  await Promise.all(stops.map((stop) => loadSingleStopAmenities(stop)));
}

async function loadSingleStopAmenities(stop) {
  const charger = stop.charger;
  const getBlock = () => planContentEl.querySelector(`[data-stop-charger-id="${charger.ID}"]`);

  if (!charger._amenityInfo) {
    try {
      charger._amenityInfo = await fetchNearbyAmenities(
        charger.AddressInfo.Latitude,
        charger.AddressInfo.Longitude,
        amenityDistanceMetersForSearch,
        preferredChainsForSearch,
        preferredShopBrandsForSearch
      );
    } catch (err) {
      console.error("Amenity lookup failed for a plan stop:", err);
      // The plan may have been swapped for a different strategy while this
      // was in flight — if so, this element no longer exists, and that's fine.
      const el = getBlock();
      if (el) el.textContent = "Couldn't check what's nearby right now.";
      return;
    }
  }

  const el = getBlock();
  if (el) el.innerHTML = renderAmenitiesHtml(charger._amenityInfo);
}

function drawPlanStops(stops) {
  stops.forEach((stop, i) => {
    const info = stop.charger.AddressInfo;
    const marker = L.marker([info.Latitude, info.Longitude], {
      icon: makeStopIcon(i + 1),
      zIndexOffset: 1000,
    }).addTo(map);

    marker.bindPopup(buildPopupHtml(stop.charger, `Recommended charging stop #${i + 1}`));
    marker.on("popupopen", () => loadNearbyAmenities(marker, stop.charger));
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

function chargerFoundStatus(chargers) {
  const breakdown = summarizeChargerSpeeds(chargers);
  return (
    `Found ${chargers.length} charger${chargers.length === 1 ? "" : "s"} near this route` +
    (breakdown ? ` (${breakdown})` : "") +
    "."
  );
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

// Counts up every time a route is selected. A background preload started
// for an earlier route checks this before each fetch and quietly bails out
// once it no longer matches — e.g. you clicked a different route option
// while the previous one's preload was still working through its list.
let preloadGeneration = 0;

// Quietly fetches "what's nearby" for every charger passed in, a few at a
// time, and caches each result on the charger object itself — the exact
// same cache popups and plan stops already check before fetching, so this
// is purely a head start, not a separate code path. Runs PRELOAD_CONCURRENCY
// requests at once (not all of them at once) to stay polite to Overpass's
// free rate limits, and any failures are silent here — if a preload fetch
// fails, the popup or plan simply fetches it fresh (and shows its own error
// if that fails too) the normal way when you actually need it.
const PRELOAD_CONCURRENCY = 3;

async function preloadAmenities(chargers) {
  const myGeneration = ++preloadGeneration;

  // Captured once, at the start, rather than read fresh per-charger — so a
  // mid-flight change to the "within" distance or chain/shop picks (from a
  // brand-new search) can't mix results fetched with two different settings
  // into the same preload run.
  const radius = amenityDistanceMetersForSearch;
  const chains = preferredChainsForSearch;
  const shopBrands = preferredShopBrandsForSearch;

  const queue = chargers.filter(
    (c) => c.AddressInfo && c.AddressInfo.Latitude != null && c.AddressInfo.Longitude != null
  );
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      if (myGeneration !== preloadGeneration) return; // a different route was picked meanwhile
      const charger = queue[nextIndex++];
      if (charger._amenityInfo) continue; // already fetched (e.g. by a plan strategy check)
      try {
        charger._amenityInfo = await fetchNearbyAmenities(
          charger.AddressInfo.Latitude,
          charger.AddressInfo.Longitude,
          radius,
          chains,
          shopBrands
        );
      } catch (err) {
        // Silent on purpose — see the function comment above.
      }
    }
  }

  await Promise.all(Array.from({ length: PRELOAD_CONCURRENCY }, worker));
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
    marker.on("popupopen", () => loadNearbyAmenities(marker, charger));
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
      <div class="amenities-block">🔍 Checking what's nearby…</div>
    </div>
  `;
}

// ---- "What's nearby" — named restaurants, playgrounds, restrooms, shops,
// with walking distance from the charger ------------------------------------
// Open Charge Map doesn't know about any of this; it comes from a separate
// free service, Overpass (a query tool for OpenStreetMap's data). This is
// fetched lazily — only when you actually open a charger's popup, and only
// once per charger (the result is cached on the charger object itself so
// reopening the same popup later doesn't fetch it again).
const AMENITY_LIST_LIMIT = 3; // don't overwhelm the popup — nearest few per category
const AMENITY_TYPES = [
  { key: "restaurant", icon: "🍔", label: "Food", plural: "Food" },
  { key: "playground", icon: "🧒", label: "Playground", plural: "Playgrounds" },
  { key: "restroom", icon: "🚻", label: "Restroom", plural: "Restrooms" },
  { key: "shop", icon: "🛒", label: "Shop", plural: "Shops" },
];

async function loadNearbyAmenities(marker, charger) {
  const getBlock = () => marker.getPopup()?.getElement()?.querySelector(".amenities-block");

  // charger._amenityInfo may already be cached — either from a previous
  // popup open, or from the "Family-friendly stops" plan strategy having
  // already checked this exact charger while building its plan. Either way
  // it was checked using the "within" distance set at search time.
  if (!charger._amenityInfo) {
    try {
      charger._amenityInfo = await fetchNearbyAmenities(
        charger.AddressInfo.Latitude,
        charger.AddressInfo.Longitude,
        amenityDistanceMetersForSearch,
        preferredChainsForSearch,
        preferredShopBrandsForSearch
      );
    } catch (err) {
      console.error("Overpass amenity lookup failed:", err);
      const el = getBlock();
      if (el) el.textContent = "Couldn't check what's nearby right now.";
      return;
    }
  }

  // The popup may have been closed (or a different one opened) while the
  // fetch was in flight, so re-find the element fresh rather than reuse
  // a stale reference from before the await.
  const el = getBlock();
  if (el) el.innerHTML = renderAmenitiesHtml(charger._amenityInfo);
}

// Builds an Overpass tag filter like ["name"~"McDonald's|KFC",i], or an
// empty string if no brand names are given (meaning: match the whole
// category, not narrowed to specific brands). Shared by the restaurant
// chain filter and the shop brand filter below.
function buildBrandNameFilter(preferredBrands) {
  if (!preferredBrands || preferredBrands.length === 0) return "";
  const pattern = preferredBrands.map(escapeRegExp).join("|");
  return `["name"~"${pattern}",i]`;
}

// Escapes a brand name for safe use inside the Overpass regex above —
// names can contain characters (like the apostrophe in "McDonald's") that
// are harmless in a name but would otherwise be treated as regex syntax.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchNearbyAmenities(lat, lon, radiusMeters, preferredChains = [], preferredShopBrands = []) {
  // When specific chains/brands are picked, these narrow the restaurant/cafe
  // and shop parts of the query to just those names (matched case-
  // insensitively against OpenStreetMap's "name" tag) instead of any
  // restaurant/cafe or any shop. It's real filtering done by Overpass
  // itself, not something applied after the fact — so if none of your
  // picks are nearby, none show up at all.
  const chainFilter = buildBrandNameFilter(preferredChains);
  const shopBrandFilter = buildBrandNameFilter(preferredShopBrands);

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"~"^(restaurant|cafe|fast_food)$"]${chainFilter}(around:${radiusMeters},${lat},${lon});
      node["leisure"="playground"](around:${radiusMeters},${lat},${lon});
      node["amenity"="toilets"](around:${radiusMeters},${lat},${lon});
      node["shop"~"^(supermarket|convenience|department_store|variety_store)$"]${shopBrandFilter}(around:${radiusMeters},${lat},${lon});
    );
    out body;
  `;

  // Makes it possible to see exactly what was searched for, from the
  // browser console (F12 → Console), instead of having to guess whether a
  // filter was actually applied.
  console.log(
    `[amenities] searching near (${lat.toFixed(5)}, ${lon.toFixed(5)}), radius ${radiusMeters}m — ` +
      `restaurant chains: ${preferredChains.length ? preferredChains.join(", ") : "(none picked — any restaurant/cafe)"}, ` +
      `shop brands: ${preferredShopBrands.length ? preferredShopBrands.join(", ") : "(none picked — any shop)"}`
  );
  console.log("[amenities] Overpass query sent:", query);

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });
  if (!response.ok) {
    console.error(`[amenities] Overpass request failed: HTTP ${response.status}`);
    throw new Error(`Overpass returned an error (HTTP ${response.status})`);
  }

  const data = await response.json();
  const origin = L.latLng(lat, lon);

  // One growable list per category first, so we can sort by distance and
  // keep only the nearest few before returning.
  const found = { restaurant: [], playground: [], restroom: [], shop: [] };

  (data.elements || []).forEach((el) => {
    const tags = el.tags || {};
    let key = null;
    if (["restaurant", "cafe", "fast_food"].includes(tags.amenity)) key = "restaurant";
    else if (tags.leisure === "playground") key = "playground";
    else if (tags.amenity === "toilets") key = "restroom";
    else if (["supermarket", "convenience", "department_store", "variety_store"].includes(tags.shop)) key = "shop";
    if (!key || el.lat == null || el.lon == null) return;

    found[key].push({
      name: tags.name || null,
      distanceMeters: origin.distanceTo(L.latLng(el.lat, el.lon)),
    });
  });

  const result = {};
  Object.keys(found).forEach((key) => {
    const sorted = found[key].sort((a, b) => a.distanceMeters - b.distanceMeters);
    result[key] = { count: sorted.length, items: sorted.slice(0, AMENITY_LIST_LIMIT) };
  });

  console.log(
    `[amenities] results near (${lat.toFixed(5)}, ${lon.toFixed(5)}):`,
    Object.fromEntries(Object.entries(result).map(([key, v]) => [key, v.count]))
  );

  return result;
}

// Distances here are short (under half a mile), so this shows them the way
// walking directions normally do — feet/meters up close, mi/km once it's
// far enough that the round number stops looking silly.
function formatWalkingDistance(meters) {
  if (distanceUnit === "km") {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }
  const feet = meters * 3.28084;
  return feet < 528 ? `${Math.round(feet)} ft` : `${(meters * MILES_PER_METER).toFixed(1)} mi`;
}

function renderAmenitiesHtml(info) {
  const groups = AMENITY_TYPES.filter((a) => info[a.key].count > 0);
  if (groups.length === 0) {
    return `Nothing found within ${formatWalkingDistance(amenityDistanceMetersForSearch)}`;
  }

  return groups
    .map((a) => {
      const { count, items } = info[a.key];
      const itemLines = items
        .map(
          (item) =>
            `<li>${escapeHtml(item.name || `Unnamed ${a.label.toLowerCase()}`)} — ${formatWalkingDistance(
              item.distanceMeters
            )}</li>`
        )
        .join("");
      const more = count > items.length ? `<li class="amenities-more">+${count - items.length} more</li>` : "";

      return `
        <div class="amenities-group">
          <div class="amenities-group-title">${a.icon} ${escapeHtml(count === 1 ? a.label : a.plural)}</div>
          <ul>${itemLines}${more}</ul>
        </div>
      `;
    })
    .join("");
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
