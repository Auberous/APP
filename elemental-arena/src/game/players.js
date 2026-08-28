// Local hot-seat player roster. Kept as a plain list (not hardcoded
// player1/player2 fields) so this generalizes later: swapping local
// keyboard control for a network connection per entry is how this scales
// toward a real multiplayer roster (eventually up to ~30 students), rather
// than a rewrite.
export const LOCAL_PLAYERS = [
  {
    id: 'p1',
    label: 'Player 1',
    color: 0x2f6fed,
    controls: 'wasd',
    spawn: { col: 3, row: 5 },
  },
  {
    id: 'p2',
    label: 'Player 2',
    color: 0x9b4bd9,
    controls: 'arrows',
    spawn: { col: 12, row: 5 },
  },
];

export default LOCAL_PLAYERS;
