/*
 * Brand lists, grouped by country and then by category. Used to build the
 * "specific chains"/"specific shops" checklists that appear under the
 * Restaurant/Cafe and Shop amenity checkboxes in the trip form.
 *
 * The app detects which country you're in (from your start location, or
 * your device as a fallback) and shows the matching lists below.
 *
 * Shape per country:
 *   {
 *     restaurants: [...],                      // flat list
 *     shops: { quickStop: [...], biggerBreak: [...] },  // two tiers
 *     placeholders: { start: "...", destination: "..." },  // example city pair
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
      "McDonald's",
      "KFC",
      "Hungry Jack's",
      "Red Rooster",
      "Guzman y Gomez",
      "Domino's",
      "Subway",
      "Nando's",
      "Oporto",
    ],
    shops: {
      quickStop: ["Coles", "Woolworths", "Aldi", "IGA", "7-Eleven"],
      biggerBreak: ["Kmart", "Big W", "Target"],
    },
    placeholders: { start: "Sydney", destination: "Melbourne" },
  },
  US: {
    restaurants: [
      "McDonald's",
      "Burger King",
      "KFC",
      "Subway",
      "Chipotle",
      "Wendy's",
      "Taco Bell",
      "Domino's",
      "Starbucks",
      "Chick-fil-A",
    ],
    shops: {
      quickStop: ["7-Eleven", "Walgreens", "CVS", "Trader Joe's", "Wawa"],
      biggerBreak: ["Target", "Walmart", "Kohl's", "Costco"],
    },
    placeholders: { start: "Austin", destination: "Dallas" },
  },
  GB: {
    restaurants: [
      "McDonald's",
      "KFC",
      "Greggs",
      "Subway",
      "Burger King",
      "Nando's",
      "Pret a Manger",
      "Costa Coffee",
      "Domino's",
    ],
    shops: {
      quickStop: ["Tesco Express", "Sainsbury's Local", "Co-op", "Spar", "Aldi"],
      biggerBreak: ["Marks & Spencer", "Argos", "TK Maxx", "Next"],
    },
    placeholders: { start: "London", destination: "Manchester" },
  },
  NZ: {
    restaurants: ["McDonald's", "KFC", "Burger King", "Subway", "Domino's", "Nando's", "Pita Pit"],
    shops: {
      quickStop: ["Countdown", "New World", "Pak'nSave", "Four Square"],
      biggerBreak: ["The Warehouse", "Kmart", "Briscoes"],
    },
    placeholders: { start: "Auckland", destination: "Wellington" },
  },
  CA: {
    restaurants: ["Tim Hortons", "McDonald's", "A&W", "Subway", "Burger King", "Wendy's", "KFC", "Domino's"],
    shops: {
      quickStop: ["Loblaws", "Sobeys", "Metro", "Shoppers Drug Mart", "Circle K"],
      biggerBreak: ["Canadian Tire", "Walmart", "Costco"],
    },
    placeholders: { start: "Toronto", destination: "Montreal" },
  },
};

// Used when the detected country isn't one of the lists above — a handful
// of chains/brands common enough internationally to be a reasonable default.
const BRAND_LISTS_DEFAULT = {
  restaurants: ["McDonald's", "KFC", "Subway", "Domino's", "Burger King"],
  shops: {
    quickStop: ["7-Eleven", "Aldi"],
    biggerBreak: ["Walmart", "Target"],
  },
  placeholders: { start: "Austin", destination: "Dallas" },
};
