import { useEffect, useRef, useState } from 'react';

import GameCanvas from '../components/GameCanvas.jsx';
import HUD from '../components/HUD.jsx';
import AbilityBar from '../components/AbilityBar.jsx';
import QuestionModal from '../components/QuestionModal.jsx';

import { useGameState } from '../hooks/useGameState.js';
import { useQuestions } from '../hooks/useQuestions.js';
import { pickRandomAbility } from '../game/abilities.js';
import { gameEvents } from '../game/gameEvents.js';

const QUESTION_INTERVAL_MS = 15000;

export default function Game1() {
  const {
    health,
    maxHealth,
    energy,
    maxEnergy,
    unlockedAbilities,
    unlockAbility,
    castAbility,
    takeDamage,
    regenEnergy,
    reset,
  } = useGameState();
  const { currentQuestion, nextQuestion, checkAnswer, clearQuestion } = useQuestions();

  const [lastUnlock, setLastUnlock] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  // React owns resources/rules; the Phaser scene (mounted by GameCanvas)
  // owns the world. These two listeners are the world -> rules half of
  // that bridge — see src/game/gameEvents.js for the full contract.
  useEffect(() => {
    const handleDamage = ({ amount }) => takeDamage(amount);
    const handleEnemyDefeated = () => {
      // Placeholder hook for future rewards (loot, bonus questions, etc.)
    };

    gameEvents.on('player-damaged', handleDamage);
    gameEvents.on('enemy-defeated', handleEnemyDefeated);
    return () => {
      gameEvents.off('player-damaged', handleDamage);
      gameEvents.off('enemy-defeated', handleEnemyDefeated);
    };
  }, [takeDamage]);

  // Slow energy regen tick.
  useEffect(() => {
    const id = setInterval(() => regenEnergy(0.5), 500);
    return () => clearInterval(id);
  }, [regenEnergy]);

  // Periodically prompt a question that unlocks a new ability when answered
  // correctly.
  const unlockedNamesRef = useRef(unlockedAbilities);
  unlockedNamesRef.current = unlockedAbilities;

  useEffect(() => {
    if (gameOver) return undefined;
    const id = setInterval(() => {
      if (!currentQuestion) nextQuestion();
    }, QUESTION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [currentQuestion, nextQuestion, gameOver]);

  useEffect(() => {
    if (health <= 0) setGameOver(true);
  }, [health]);

  const handleAnswer = (answerIndex) => {
    const correct = checkAnswer(answerIndex);
    clearQuestion();

    if (correct) {
      const names = unlockedNamesRef.current.map((a) => a.name);
      const reward = pickRandomAbility(names);
      if (reward) {
        unlockAbility(reward);
        setLastUnlock(reward.name);
        setTimeout(() => setLastUnlock(null), 2500);
      }
    }
  };

  const handleCast = (abilityName) => {
    const ability = castAbility(abilityName);
    if (ability) gameEvents.emit('cast-ability', { ability });
  };

  const handleRestart = () => {
    reset();
    setGameOver(false);
  };

  return (
    <div className="game1-page">
      <h1>Game 1: Elemental Arena</h1>

      <HUD health={health} maxHealth={maxHealth} energy={energy} maxEnergy={maxEnergy} />

      <div className="game-world">
        <GameCanvas />
        {gameOver && (
          <div className="game-over-overlay">
            <p>You were defeated.</p>
            <button onClick={handleRestart}>Try Again</button>
          </div>
        )}
      </div>

      {lastUnlock && <div className="unlock-toast">Unlocked: {lastUnlock}!</div>}

      <AbilityBar abilities={unlockedAbilities} energy={energy} onCast={handleCast} />

      <button
        className="question-trigger"
        onClick={() => !currentQuestion && nextQuestion()}
        disabled={Boolean(currentQuestion) || gameOver}
      >
        Answer a Question (unlock an ability)
      </button>

      {currentQuestion && (
        <QuestionModal
          question={currentQuestion.question}
          answers={currentQuestion.answers}
          onAnswer={handleAnswer}
        />
      )}
    </div>
  );
}
