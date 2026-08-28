import { abilities } from './abilities.js';

// Each shop sells the abilities matching its `type`, and sits inside its
// matching biome region of the (much bigger) arena — see game/match.js
// for the grid size and game/biomes.js on the client for the matching
// visual zone layout. Walking up to one opens it (see ArenaScene's
// shop-zone overlap check); "paying" for an item means answering a
// question correctly (see Game1.jsx / ShopPanel.jsx).
export const SHOPS = [
  {
    id: 'attack-bazaar',
    name: 'Attack Bazaar',
    type: 'attack',
    tile: { col: 6, row: 4 },
    color: 0xd94b4b,
  },
  {
    id: 'defense-outpost',
    name: 'Defense Outpost',
    type: 'defend',
    tile: { col: 33, row: 4 },
    color: 0x4b8fd9,
  },
  {
    id: 'builders-yard',
    name: "Builder's Yard",
    type: 'build',
    tile: { col: 20, row: 20 },
    color: 0xc9a24b,
  },
];

export function getShopItems(shop) {
  return abilities.filter((ability) => ability.type === shop.type);
}

export function getShopById(shopId) {
  return SHOPS.find((shop) => shop.id === shopId) ?? null;
}

export default SHOPS;
