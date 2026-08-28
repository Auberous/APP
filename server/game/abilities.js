import { ELEMENTS } from './elements.js';

// Ability `type` drives what the world does when it's cast:
//   'attack' — damages a nearby opponent
//   'defend' — grants a brief shield that reduces incoming damage
//   'build'  — places a block in front of the player
//
// `unlockCost` is how many questions must be answered correctly at a shop
// to unlock it — scaled with how powerful/durable the ability is, so the
// strongest options take the most practice to earn.
export const abilities = [
  {
    name: 'Fireball',
    element: ELEMENTS.FIRE,
    type: 'attack',
    cost: 20,
    damage: 25,
    unlockCost: 2,
    description: 'Hurl a blazing ball of fire at the target.',
  },
  {
    name: 'Tidal Wave',
    element: ELEMENTS.WATER,
    type: 'attack',
    cost: 25,
    damage: 20,
    unlockCost: 2,
    description: 'Summon a wave that crashes into the target.',
  },
  {
    name: 'Chain Lightning',
    element: ELEMENTS.LIGHTNING,
    type: 'attack',
    cost: 30,
    damage: 30,
    unlockCost: 3,
    description: 'Strike the target with a bolt of lightning.',
  },
  {
    name: 'Shadow Grasp',
    element: ELEMENTS.SHADOW,
    type: 'attack',
    cost: 20,
    damage: 18,
    unlockCost: 1,
    description: 'Dark tendrils grasp and drain the target.',
  },
  {
    name: 'Stone Ward',
    element: ELEMENTS.EARTH,
    type: 'defend',
    cost: 15,
    shieldPercent: 50,
    duration: 4000,
    unlockCost: 2,
    description: 'Harden your skin, halving incoming damage briefly.',
  },
  {
    name: 'Mist Veil',
    element: ELEMENTS.WATER,
    type: 'defend',
    cost: 20,
    shieldPercent: 65,
    duration: 4000,
    unlockCost: 3,
    description: 'Wrap yourself in mist, deflecting most attacks.',
  },
  {
    name: 'Gale Barrier',
    element: ELEMENTS.AIR,
    type: 'defend',
    cost: 18,
    shieldPercent: 40,
    duration: 3000,
    unlockCost: 1,
    description: 'A swirling wind buffer softens the next hits.',
  },
  {
    name: 'Umbral Cloak',
    element: ELEMENTS.SHADOW,
    type: 'defend',
    cost: 25,
    shieldPercent: 75,
    duration: 3000,
    unlockCost: 3,
    description: 'Fade into shadow to avoid most damage.',
  },
  {
    name: 'Stone Wall',
    element: ELEMENTS.EARTH,
    type: 'build',
    cost: 15,
    unlockCost: 2,
    description: 'Raise a block of solid stone in front of you.',
  },
  {
    name: 'Ice Block',
    element: ELEMENTS.WATER,
    type: 'build',
    cost: 15,
    unlockCost: 2,
    description: 'Freeze a block of ice in front of you.',
  },
  {
    name: 'Root Wall',
    element: ELEMENTS.EARTH,
    type: 'build',
    cost: 12,
    unlockCost: 1,
    description: 'Grow a tangle of roots into a barrier.',
  },
  {
    name: 'Obsidian Block',
    element: ELEMENTS.FIRE,
    type: 'build',
    cost: 20,
    unlockCost: 3,
    description: 'Cool molten rock into a sturdy, hard-to-break obsidian block.',
  },
];

// Picks a random ability the player hasn't unlocked yet.
export function pickRandomAbility(unlockedNames = []) {
  const locked = abilities.filter((ability) => !unlockedNames.includes(ability.name));
  if (locked.length === 0) return null;
  return locked[Math.floor(Math.random() * locked.length)];
}

export default abilities;
