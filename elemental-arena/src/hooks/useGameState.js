import { useState, useCallback } from 'react';
import { applyAbility } from '../utils/applyAbility.js';

const INITIAL_STATE = {
  health: 100,
  energy: 100,
};

export function useGameState() {
  const [state, setState] = useState(INITIAL_STATE);

  const activateAbility = useCallback((ability, target) => {
    setState((prev) => {
      if (prev.energy < ability.cost) return prev;
      return applyAbility(ability, prev, target);
    });
  }, []);

  const takeDamage = useCallback((amount) => {
    setState((prev) => ({
      ...prev,
      health: Math.max(0, prev.health - amount),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    health: state.health,
    energy: state.energy,
    activateAbility,
    takeDamage,
    reset,
  };
}

export default useGameState;
