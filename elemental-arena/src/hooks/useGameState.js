import { useCallback, useRef, useState } from 'react';

const INITIAL_STATE = {
  health: 100,
  maxHealth: 100,
  energy: 100,
  maxEnergy: 100,
};

const ENERGY_REGEN_PER_SECOND = 4;

// Owns the player's resources (health/energy), unlocked abilities, and the
// rules for spending energy on a cast. The Phaser world asks this hook
// (via events wired up in the page) to actually apply damage/shielding —
// this hook never touches the DOM or the canvas.
export function useGameState() {
  const [state, setState] = useState(INITIAL_STATE);
  const [unlockedAbilities, setUnlockedAbilities] = useState([]);
  const shieldRef = useRef({ percent: 0, expiresAt: 0 });

  const unlockAbility = useCallback((ability) => {
    setUnlockedAbilities((prev) => {
      if (prev.some((a) => a.name === ability.name)) return prev;
      return [...prev, ability];
    });
  }, []);

  // Returns null if the cast can't happen (not unlocked / not enough
  // energy), otherwise deducts the cost and — for defend abilities —
  // arms a temporary damage shield.
  const castAbility = useCallback(
    (abilityName) => {
      const ability = unlockedAbilities.find((a) => a.name === abilityName);
      if (!ability) return null;

      let didCast = false;
      setState((prev) => {
        if (prev.energy < ability.cost) return prev;
        didCast = true;
        return { ...prev, energy: prev.energy - ability.cost };
      });

      if (!didCast) return null;

      if (ability.type === 'defend') {
        shieldRef.current = {
          percent: ability.shieldPercent,
          expiresAt: Date.now() + ability.duration,
        };
      }

      return ability;
    },
    [unlockedAbilities]
  );

  const takeDamage = useCallback((amount) => {
    const shield = shieldRef.current;
    const shieldActive = shield.expiresAt > Date.now();
    const reduced = shieldActive
      ? Math.round(amount * (1 - shield.percent / 100))
      : amount;

    setState((prev) => ({
      ...prev,
      health: Math.max(0, prev.health - reduced),
    }));
  }, []);

  const regenEnergy = useCallback((deltaSeconds) => {
    setState((prev) => ({
      ...prev,
      energy: Math.min(
        prev.maxEnergy,
        prev.energy + ENERGY_REGEN_PER_SECOND * deltaSeconds
      ),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setUnlockedAbilities([]);
    shieldRef.current = { percent: 0, expiresAt: 0 };
  }, []);

  return {
    health: Math.round(state.health),
    maxHealth: state.maxHealth,
    energy: Math.round(state.energy),
    maxEnergy: state.maxEnergy,
    unlockedAbilities,
    unlockAbility,
    castAbility,
    takeDamage,
    regenEnergy,
    reset,
  };
}

export default useGameState;
