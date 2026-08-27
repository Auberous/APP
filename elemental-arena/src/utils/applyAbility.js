import { calculateDamage } from './calculateDamage.js';

export function applyAbility(ability, state, target) {
  const energy = Math.max(0, state.energy - ability.cost);
  const damage = calculateDamage(ability, target);
  const health = Math.max(0, state.health - damage);

  return {
    ...state,
    energy,
    health,
  };
}

export default applyAbility;
