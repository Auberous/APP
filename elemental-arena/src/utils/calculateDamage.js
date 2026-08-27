export function calculateDamage(ability, target) {
  if (!ability || ability.type !== 'attack') return 0;

  let damage = ability.damage;

  // Placeholder elemental modifier hook — future elemental
  // strengths/weaknesses can adjust damage here based on target.element.
  if (target && target.element === ability.element) {
    damage = Math.round(damage * 0.5);
  }

  return damage;
}

export default calculateDamage;
