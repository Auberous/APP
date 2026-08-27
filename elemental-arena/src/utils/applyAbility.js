import { calculateDamage } from './calculateDamage.js';

// Applies the resource cost (and, for attack abilities, damage to a target)
// of casting an ability, returning the updated state. Does not mutate the
// state passed in.
export function applyAbility(ability, state, target) {
  const energy = Math.max(0, state.energy - ability.cost);
  const nextState = { ...state, energy };

  if (ability.type === 'attack' && target) {
    const damage = calculateDamage(ability, target);
    nextState.health = Math.max(0, (target.health ?? 0) - damage);
  }

  return nextState;
}

export default applyAbility;
