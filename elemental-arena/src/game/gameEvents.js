import Phaser from 'phaser';

// Shared event bus between React (which owns game *rules* — health, energy,
// unlocked abilities, cost checks) and the Phaser scene (which owns the
// *world* — tile map, sprites, movement, collisions, visual effects).
//
// React -> Phaser:
//   'cast-ability'      { ability }            player wants to use an ability
//
// Phaser -> React:
//   'player-damaged'    { amount }             enemy hit the player
//   'enemy-defeated'    {}                      enemy dummy's HP hit 0
export const gameEvents = new Phaser.Events.EventEmitter();

export default gameEvents;
