import { ELEMENTS } from './elements.js';

export const abilities = [
  {
    name: 'Fireball',
    element: ELEMENTS.FIRE,
    cost: 20,
    damage: 25,
    description: 'Hurl a blazing ball of fire at the target.',
  },
  {
    name: 'Tidal Wave',
    element: ELEMENTS.WATER,
    cost: 25,
    damage: 20,
    description: 'Summon a wave that crashes into the target.',
  },
  {
    name: 'Stone Spikes',
    element: ELEMENTS.EARTH,
    cost: 15,
    damage: 15,
    description: 'Erupt sharp stone spikes from the ground.',
  },
  {
    name: 'Gale Slash',
    element: ELEMENTS.AIR,
    cost: 10,
    damage: 10,
    description: 'A quick, cutting blast of wind.',
  },
  {
    name: 'Chain Lightning',
    element: ELEMENTS.LIGHTNING,
    cost: 30,
    damage: 30,
    description: 'Strike the target with a bolt of lightning.',
  },
  {
    name: 'Shadow Grasp',
    element: ELEMENTS.SHADOW,
    cost: 20,
    damage: 18,
    description: 'Dark tendrils grasp and drain the target.',
  },
  {
    name: 'Magma Burst',
    element: ELEMENTS.FIRE,
    cost: 35,
    damage: 35,
    description: 'An explosive burst of molten rock.',
  },
  {
    name: 'Frost Spike',
    element: ELEMENTS.WATER,
    cost: 15,
    damage: 12,
    description: 'A sharp shard of ice pierces the target.',
  },
  {
    name: 'Boulder Toss',
    element: ELEMENTS.EARTH,
    cost: 25,
    damage: 22,
    description: 'Hurl a massive boulder at the target.',
  },
  {
    name: 'Cyclone',
    element: ELEMENTS.AIR,
    cost: 30,
    damage: 28,
    description: 'A spinning vortex batters the target.',
  },
  {
    name: 'Thunderclap',
    element: ELEMENTS.LIGHTNING,
    cost: 18,
    damage: 16,
    description: 'A sudden, deafening burst of electric force.',
  },
  {
    name: 'Void Pulse',
    element: ELEMENTS.SHADOW,
    cost: 40,
    damage: 40,
    description: 'A pulse of pure darkness overwhelms the target.',
  },
];

export default abilities;
