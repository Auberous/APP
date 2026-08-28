// Two-Base Team Arena — Phase 1: teams, bases, melee combat only. No
// weapons, fire, dogs, repair, sabotage, or resource economy yet (those
// are later phases). See server/README.md for the phase plan.

export const TEAMS = [
  { id: 'red', name: 'Red Team', color: 0xd94b4b },
  { id: 'blue', name: 'Blue Team', color: 0x4b8fd9 },
];

export function getTeamById(teamId) {
  return TEAMS.find((t) => t.id === teamId) ?? null;
}

export default TEAMS;
