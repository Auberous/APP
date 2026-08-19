/*
 * Brand lists, grouped by country and then by category. Used to build the
 * "specific chains"/"specific shops" checklists that appear under the Food
 * and Shop amenity checkboxes in the trip form.
 *
 * The app detects which country you're in (from your start location, or
 * your device as a fallback) and shows the matching lists below.
 *
 * Each brand is { name, domain } — `name` is what's actually searched for
 * (the checkbox value, matched against OpenStreetMap listings) and shown as
 * a fallback label; `domain` is the brand's official website, used to fetch
 * its real logo live from a free logo-by-domain service (see
 * renderBrandChecklist() in app.js) instead of a generic emoji. A wrong or
 * dead domain just means that one logo quietly falls back to text — it
 * doesn't affect search behavior, which only ever uses `name`.
 *
 * These domains are my best-effort mapping, not independently verified
 * against each site — if one looks wrong, it's a one-line fix here.
 *
 * Shape per country:
 *   {
 *     restaurants: [{ name, domain }, ...],
 *     shops: { quickStop: [{ name, domain }, ...], biggerBreak: [...] },
 *     placeholders: { start: "...", destination: "..." },  // example city pair
 *     units: "metric" or "imperial",           // default unit toggles (km/m vs mi/ft)
 *   }
 *
 * To add a new country: add one more "XX": {...} entry below, keyed by its
 * ISO 3166-1 alpha-2 country code (the same 2-letter codes Nominatim/OSM
 * already use, e.g. "AU", "US", "GB"). To add a new category later (e.g.
 * pharmacies), add a new key alongside "restaurants"/"shops" here, plus
 * whatever picker UI + Overpass query line uses it in app.js — the country
 * detection and rendering plumbing is already generic.
 *
 * These lists are necessarily approximate — real-world chain presence
 * varies by region within a country too, and this only covers a handful of
 * well-known names per place.
 */

const BRAND_LISTS_BY_COUNTRY = {
  AU: {
    restaurants: [
      { name: "McDonald's", domain: "mcdonalds.com.au" },
      { name: "KFC", domain: "kfc.com.au" },
      { name: "Hungry Jack's", domain: "hungryjacks.com.au" },
      { name: "Red Rooster", domain: "redrooster.com.au" },
      { name: "Guzman y Gomez", domain: "guzmanygomez.com.au" },
      { name: "Domino's", domain: "dominos.com.au" },
      { name: "Subway", domain: "subway.com" },
      { name: "Nando's", domain: "nandos.com.au" },
      { name: "Oporto", domain: "oporto.com.au" },
    ],
    shops: {
      quickStop: [
        { name: "Coles", domain: "coles.com.au" },
        { name: "Woolworths", domain: "woolworths.com.au" },
        { name: "Aldi", domain: "aldi.com.au" },
        { name: "IGA", domain: "iga.com.au" },
        { name: "7-Eleven", domain: "7eleven.com.au" },
      ],
      biggerBreak: [
        { name: "Kmart", domain: "kmart.com.au" },
        { name: "Big W", domain: "bigw.com.au" },
        { name: "Target", domain: "target.com.au" },
      ],
    },
    placeholders: { start: "Sydney", destination: "Melbourne" },
    units: "metric",
  },
  US: {
    restaurants: [
      { name: "McDonald's", domain: "mcdonalds.com" },
      { name: "Burger King", domain: "bk.com" },
      { name: "KFC", domain: "kfc.com" },
      { name: "Subway", domain: "subway.com" },
      { name: "Chipotle", domain: "chipotle.com" },
      { name: "Wendy's", domain: "wendys.com" },
      { name: "Taco Bell", domain: "tacobell.com" },
      { name: "Domino's", domain: "dominos.com" },
      { name: "Starbucks", domain: "starbucks.com" },
      { name: "Chick-fil-A", domain: "chick-fil-a.com" },
    ],
    shops: {
      quickStop: [
        { name: "7-Eleven", domain: "7eleven.com" },
        { name: "Walgreens", domain: "walgreens.com" },
        { name: "CVS", domain: "cvs.com" },
        { name: "Trader Joe's", domain: "traderjoes.com" },
        { name: "Wawa", domain: "wawa.com" },
      ],
      biggerBreak: [
        { name: "Target", domain: "target.com" },
        { name: "Walmart", domain: "walmart.com" },
        { name: "Kohl's", domain: "kohls.com" },
        { name: "Costco", domain: "costco.com" },
      ],
    },
    placeholders: { start: "Austin", destination: "Dallas" },
    units: "imperial",
  },
  GB: {
    restaurants: [
      { name: "McDonald's", domain: "mcdonalds.com" },
      { name: "KFC", domain: "kfc.co.uk" },
      { name: "Greggs", domain: "greggs.co.uk" },
      { name: "Subway", domain: "subway.com" },
      { name: "Burger King", domain: "burgerking.co.uk" },
      { name: "Nando's", domain: "nandos.co.uk" },
      { name: "Pret a Manger", domain: "pret.co.uk" },
      { name: "Costa Coffee", domain: "costa.co.uk" },
      { name: "Domino's", domain: "dominos.co.uk" },
    ],
    shops: {
      quickStop: [
        { name: "Tesco Express", domain: "tesco.com" },
        { name: "Sainsbury's Local", domain: "sainsburys.co.uk" },
        { name: "Co-op", domain: "coop.co.uk" },
        { name: "Spar", domain: "spar.co.uk" },
        { name: "Aldi", domain: "aldi.co.uk" },
      ],
      biggerBreak: [
        { name: "Marks & Spencer", domain: "marksandspencer.com" },
        { name: "Argos", domain: "argos.co.uk" },
        { name: "TK Maxx", domain: "tkmaxx.com" },
        { name: "Next", domain: "next.co.uk" },
      ],
    },
    placeholders: { start: "London", destination: "Manchester" },
    units: "metric",
  },
  NZ: {
    restaurants: [
      { name: "McDonald's", domain: "mcdonalds.co.nz" },
      { name: "KFC", domain: "kfc.co.nz" },
      { name: "Burger King", domain: "burgerking.co.nz" },
      { name: "Subway", domain: "subway.com" },
      { name: "Domino's", domain: "dominos.co.nz" },
      { name: "Nando's", domain: "nandos.co.nz" },
      { name: "Pita Pit", domain: "pitapit.co.nz" },
    ],
    shops: {
      quickStop: [
        { name: "Countdown", domain: "countdown.co.nz" },
        { name: "New World", domain: "newworld.co.nz" },
        { name: "Pak'nSave", domain: "paknsave.co.nz" },
        { name: "Four Square", domain: "foursquare.co.nz" },
      ],
      biggerBreak: [
        { name: "The Warehouse", domain: "thewarehouse.co.nz" },
        { name: "Kmart", domain: "kmart.co.nz" },
        { name: "Briscoes", domain: "briscoes.co.nz" },
      ],
    },
    placeholders: { start: "Auckland", destination: "Wellington" },
    units: "metric",
  },
  CA: {
    restaurants: [
      { name: "Tim Hortons", domain: "timhortons.ca" },
      { name: "McDonald's", domain: "mcdonalds.ca" },
      { name: "A&W", domain: "aw.ca" },
      { name: "Subway", domain: "subway.com" },
      { name: "Burger King", domain: "burgerking.ca" },
      { name: "Wendy's", domain: "wendys.com" },
      { name: "KFC", domain: "kfc.ca" },
      { name: "Domino's", domain: "dominos.ca" },
    ],
    shops: {
      quickStop: [
        { name: "Loblaws", domain: "loblaws.ca" },
        { name: "Sobeys", domain: "sobeys.com" },
        { name: "Metro", domain: "metro.ca" },
        { name: "Shoppers Drug Mart", domain: "shoppersdrugmart.ca" },
        { name: "Circle K", domain: "circlek.com" },
      ],
      biggerBreak: [
        { name: "Canadian Tire", domain: "canadiantire.ca" },
        { name: "Walmart", domain: "walmart.ca" },
        { name: "Costco", domain: "costco.ca" },
      ],
    },
    placeholders: { start: "Toronto", destination: "Montreal" },
    units: "metric",
  },
};

// Used when the detected country isn't one of the lists above — a handful
// of chains/brands common enough internationally to be a reasonable default.
const BRAND_LISTS_DEFAULT = {
  restaurants: [
    { name: "McDonald's", domain: "mcdonalds.com" },
    { name: "KFC", domain: "kfc.com" },
    { name: "Subway", domain: "subway.com" },
    { name: "Domino's", domain: "dominos.com" },
    { name: "Burger King", domain: "bk.com" },
  ],
  shops: {
    quickStop: [
      { name: "7-Eleven", domain: "7eleven.com" },
      { name: "Aldi", domain: "aldi.com" },
    ],
    biggerBreak: [
      { name: "Walmart", domain: "walmart.com" },
      { name: "Target", domain: "target.com" },
    ],
  },
  placeholders: { start: "Austin", destination: "Dallas" },
  units: "imperial",
};
