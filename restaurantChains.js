/*
 * Fast-food / chain restaurant lists, grouped by country.
 *
 * Used to build the "specific chains" checklist that appears under the
 * Restaurant/Cafe amenity checkbox in the trip form. The app detects which
 * country you're in (from your start location, or your device as a
 * fallback) and shows the matching list below.
 *
 * To add a new country: add one more "XX": [...] entry below, keyed by its
 * ISO 3166-1 alpha-2 country code (the same 2-letter codes Nominatim/OSM
 * already use, e.g. "AU", "US", "GB"). Nothing else in the app needs to
 * change — the chain picker and the Overpass query filter both read from
 * this file automatically.
 */

const RESTAURANT_CHAINS_BY_COUNTRY = {
  AU: [
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
  US: [
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
  GB: [
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
  NZ: ["McDonald's", "KFC", "Burger King", "Subway", "Domino's", "Nando's", "Pita Pit"],
  CA: ["Tim Hortons", "McDonald's", "A&W", "Subway", "Burger King", "Wendy's", "KFC", "Domino's"],
};

// Used when the detected country isn't one of the lists above — a handful
// of chains common enough internationally to be a reasonable default.
const RESTAURANT_CHAINS_DEFAULT = ["McDonald's", "KFC", "Subway", "Domino's", "Burger King"];
