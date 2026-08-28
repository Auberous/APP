import { useEffect, useState } from 'react';

import GameCanvas from '../components/GameCanvas.jsx';
import HUD from '../components/HUD.jsx';
import AbilityBar from '../components/AbilityBar.jsx';
import QuestionModal from '../components/QuestionModal.jsx';
import ShopPanel from '../components/ShopPanel.jsx';

import { useGameState } from '../hooks/useGameState.js';
import { useQuestions } from '../hooks/useQuestions.js';
import { getShopById, getShopItems } from '../game/shops.js';
import { gameEvents } from '../game/gameEvents.js';

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

  const [activeShopId, setActiveShopId] = useState(null);
  const [pendingItem, setPendingItem] = useState(null);
  const [lastUnlock, setLastUnlock] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  // React owns resources/rules; the Phaser scene (mounted by GameCanvas)
  // owns the world. These listeners are the world -> rules half of that
  // bridge — see src/game/gameEvents.js for the full contract.
  useEffect(() => {
    const handleDamage = ({ amount }) => takeDamage(amount);
    const handleEnemyDefeated = () => {
      // Placeholder hook for future rewards (loot, bonus questions, etc.)
    };
    const handleShopEntered = ({ shopId }) => setActiveShopId(shopId);
    const handleShopExited = () => {
      setActiveShopId(null);
      setPendingItem(null);
      clearQuestion();
    };

    gameEvents.on('player-damaged', handleDamage);
    gameEvents.on('enemy-defeated', handleEnemyDefeated);
    gameEvents.on('shop-entered', handleShopEntered);
    gameEvents.on('shop-exited', handleShopExited);
    return () => {
      gameEvents.off('player-damaged', handleDamage);
      gameEvents.off('enemy-defeated', handleEnemyDefeated);
      gameEvents.off('shop-entered', handleShopEntered);
      gameEvents.off('shop-exited', handleShopExited);
    };
  }, [takeDamage, clearQuestion]);

  // Slow energy regen tick.
  useEffect(() => {
    const id = setInterval(() => regenEnergy(0.5), 500);
    return () => clearInterval(id);
  }, [regenEnergy]);

  useEffect(() => {
    if (health <= 0) setGameOver(true);
  }, [health]);

  const activeShop = activeShopId ? getShopById(activeShopId) : null;
  const shopItems = activeShop ? getShopItems(activeShop) : [];
  const ownedNames = unlockedAbilities.map((a) => a.name);

  const handleBuy = (item) => {
    setPendingItem(item);
    nextQuestion();
  };

  const handleAnswer = (answerIndex) => {
    const correct = checkAnswer(answerIndex);
    clearQuestion();

    if (correct && pendingItem) {
      unlockAbility(pendingItem);
      setLastUnlock(pendingItem.name);
      setTimeout(() => setLastUnlock(null), 2500);
    }
    setPendingItem(null);
  };

  const handleCast = (abilityName) => {
    const ability = castAbility(abilityName);
    if (ability) gameEvents.emit('cast-ability', { ability });
  };

  const handleRestart = () => {
    reset();
    setGameOver(false);
    setActiveShopId(null);
    setPendingItem(null);
  };

  return (
    <div className="game1-page">
      <h1>Game 1: Elemental Arena</h1>
      <p className="game1-hint">
        Move with WASD/arrows. Walk up to a shop to unlock items by answering
        questions, then cast them below.
      </p>

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

      {activeShop && !currentQuestion && (
        <ShopPanel
          shop={activeShop}
          items={shopItems}
          ownedNames={ownedNames}
          onBuy={handleBuy}
        />
      )}

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
