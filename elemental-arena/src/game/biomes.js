// Visual zone layout for the arena's biomes. Purely cosmetic (which
// ground texture to draw at a given tile) — the server doesn't know or
// care about biomes, it just has a bigger grid now (see server/game/
// match.js, GRID_WIDTH/GRID_HEIGHT, kept in sync with GRID_WIDTH/HEIGHT
// below by hand for now).
//
// Layout: a central grass "warzone" band (where everyone spawns) with
// three biome regions further out, each holding one shop — see
// game/shops.js for the shop tile positions, placed inside these same
// regions.
export const GRID_WIDTH = 40;
export const GRID_HEIGHT = 24;

export const BIOME = {
  GRASS: 'grass',
  FIRE: 'fire',
  ICE: 'ice',
  SHADOW: 'shadow',
};

const FIRE_ZONE = { colMin: 0, colMax: 13, rowMin: 0, rowMax: 9 };
const ICE_ZONE = { colMin: 26, colMax: 39, rowMin: 0, rowMax: 9 };
const SHADOW_ZONE = { colMin: 0, colMax: 39, rowMin: 16, rowMax: 23 };

function inZone(col, row, zone) {
  return col >= zone.colMin && col <= zone.colMax && row >= zone.rowMin && row <= zone.rowMax;
}

export function getBiomeAt(col, row) {
  if (inZone(col, row, FIRE_ZONE)) return BIOME.FIRE;
  if (inZone(col, row, ICE_ZONE)) return BIOME.ICE;
  if (inZone(col, row, SHADOW_ZONE)) return BIOME.SHADOW;
  return BIOME.GRASS;
}
