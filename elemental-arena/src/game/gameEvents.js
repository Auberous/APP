import Phaser from 'phaser';

// Shared event bus between React (which owns the network connection to the
// server — the server is now authoritative for all game rules: health,
// energy, position, unlocked abilities, match phase) and the Phaser scene
// (a pure renderer + input capturer — it no longer runs any game logic
// itself).
//
// Phaser -> React:
//   'input-changed'  { up, down, left, right }   local player's raw input,
//                                                  forwarded to the server
//
// React -> Phaser:
//   'net:snapshot'  { snapshot, youId }   latest authoritative match state
//                                          (players, blocks, phase), sent
//                                          on every server tick (~20Hz)
//   'net:effect'    { effect }            one-off visual event (an attack
//                                          landing, a shield going up, a
//                                          failed build) from the server
export const gameEvents = new Phaser.Events.EventEmitter();

export default gameEvents;
