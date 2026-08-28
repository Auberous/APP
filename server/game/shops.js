import { abilities } from './abilities.js';

// Each shop sells the abilities matching its `type`, and sits at a fixed
// tile position in the arena. Walking up to one opens it (see ArenaScene's
// shop-zone overlap check); "paying" for an item means answering a
// question correctly (see Game1.jsx / ShopPanel.jsx).
export const SHOPS = [
  {
    id: 'attack-bazaar',
    name: 'Attack Bazaar',
    type: 'attack',
    tile: { col: 1, row: 1 },
    color: 0xd94b4b,
  },
  {
    id: 'defense-outpost',
    name: 'Defense Outpost',
    type: 'defend',
    tile: { col: 14, row: 1 },
    color: 0x4b8fd9,
  },
  {
    id: 'builders-yard',
    name: "Builder's Yard",
    type: 'build',
    tile: { col: 7, row: 8 },
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
