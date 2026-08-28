import Phaser from 'phaser';

// Shared event bus between React (owns the network connection — the
// server is authoritative for everything: position, team, hits taken,
// disable/respawn) and the Phaser scene (a pure renderer + input
// capturer — it runs no game rules itself).
//
// Phaser -> React:
//   'input-changed'  { up, down, left, right }   local player's raw movement input
//   'punch-pressed'  {}                          local player pressed the punch key
//
// React -> Phaser:
//   'net:snapshot'  { snapshot, youId }   latest authoritative match state,
//                                          sent on every server tick (~20Hz)
//   'net:effect'    { effect }            one-off visual event (a punch
//                                          landing or missing) from the server
export const gameEvents = new Phaser.Events.EventEmitter();

export default gameEvents;
