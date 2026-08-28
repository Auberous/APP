// Base layout: two mirrored bases on opposite sides of the map, red on
// the left, blue on the right. Phase 1 only needs a barracks (spawn/
// respawn point) per team — the frontline/mid-base/backline zones from
// the full spec (cannon row, ammo depot, kennel, etc.) get filled in as
// their systems land in later phases.

export const TILE_SIZE = 32;
export const GRID_WIDTH = 40;
export const GRID_HEIGHT = 20;

export const BASES = {
  red: {
    barracks: { col: 3, row: 10 },
    spawnPoints: [
      { col: 3, row: 8 },
      { col: 3, row: 12 },
      { col: 5, row: 6 },
      { col: 5, row: 14 },
      { col: 2, row: 10 },
      { col: 6, row: 10 },
      { col: 4, row: 9 },
      { col: 4, row: 11 },
    ],
  },
  blue: {
    barracks: { col: GRID_WIDTH - 4, row: 10 },
    spawnPoints: [
      { col: GRID_WIDTH - 4, row: 8 },
      { col: GRID_WIDTH - 4, row: 12 },
      { col: GRID_WIDTH - 6, row: 6 },
      { col: GRID_WIDTH - 6, row: 14 },
      { col: GRID_WIDTH - 3, row: 10 },
      { col: GRID_WIDTH - 7, row: 10 },
      { col: GRID_WIDTH - 5, row: 9 },
      { col: GRID_WIDTH - 5, row: 11 },
    ],
  },
};

export function getBase(teamId) {
  return BASES[teamId] ?? null;
}

export default BASES;
