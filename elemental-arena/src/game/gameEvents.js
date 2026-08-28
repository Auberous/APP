import Phaser from 'phaser';

// Shared event bus between React (which owns game *rules* — health, energy,
// unlocked abilities, cost checks, match phase) and the Phaser scene (which
// owns the *world* — tile map, sprites, movement, collisions, visual
// effects). Every payload that concerns a specific player carries a
// `playerId` so this scales past two hot-seat players without changing
// shape later.
//
// React -> Phaser:
//   'cast-ability'   { playerId, ability }   a player wants to use an ability
//   'phase-changed'  { phase }               'prep' | 'battle' | 'over'
//   'health-changed' { playerId, health, maxHealth }  keeps on-sprite bars in sync
//
// Phaser -> React:
//   'player-damaged' { playerId, amount }    a player was hit
//   'shop-zone'      { playerId, shopId }    shopId is null when leaving a shop
export const gameEvents = new Phaser.Events.EventEmitter();

export default gameEvents;
