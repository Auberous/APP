import { useEffect, useState } from 'react';

import GameCanvas from '../components/GameCanvas.jsx';
import HUD from '../components/HUD.jsx';
import AbilityBar from '../components/AbilityBar.jsx';
import QuestionModal from '../components/QuestionModal.jsx';
import ShopPanel from '../components/ShopPanel.jsx';

import { useGameState } from '../hooks/useGameState.js';
import { useQuestions } from '../hooks/useQuestions.js';
import { getShopById, getShopItems } from '../game/shops.js';
import { LOCAL_PLAYERS } from '../game/players.js';
import { gameEvents } from '../game/gameEvents.js';

const PREP_DURATION_SECONDS = 60;

function toHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// One column of the match: a player's HUD, abilities, and whichever of
// shop/question panel currently applies to them. All the actual state
// (health, unlocked abilities, current question, shop progress) lives in
// Game1 and is passed in as props, keyed by player id — see the comment
// on game/players.js for why this stays list-shaped rather than p1/p2
// fields.
function PlayerPanel({ config, gameState, questionState, activeShopId, pending, onBuy, onAnswer, onCast }) {
  const activeShop = activeShopId ? getShopById(activeShopId) : null;
  const shopItems = activeShop ? getShopItems(activeShop) : [];
  const ownedNames = gameState.unlockedAbilities.map((a) => a.name);

  return (
    <div className="player-panel" style={{ '--player-color': toHex(config.color) }}>
      <div className="player-panel-label">
        <span className="player-color-dot" />
        {config.label}
        <span style={{ opacity: 0.6, fontWeight: 'normal' }}>
          ({config.controls === 'wasd' ? 'WASD' : 'Arrow keys'})
        </span>
      </div>

      <HUD
        health={gameState.health}
        maxHealth={gameState.maxHealth}
        energy={gameState.energy}
        maxEnergy={gameState.maxEnergy}
      />

      <AbilityBar abilities={gameState.unlockedAbilities} energy={gameState.energy} onCast={onCast} />

      {questionState.currentQuestion ? (
        <QuestionModal
          question={questionState.currentQuestion.question}
          answers={questionState.currentQuestion.answers}
          onAnswer={onAnswer}
        />
      ) : (
        activeShop && (
          <ShopPanel shop={activeShop} items={shopItems} ownedNames={ownedNames} onBuy={onBuy} />
        )
      )}

      {pending && questionState.currentQuestion && (
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
          Unlocking {pending.item.name}: {pending.progress}/{pending.item.unlockCost} correct
        </p>
      )}
    </div>
  );
}

export default function Game1() {
  const [p1, p2] = LOCAL_PLAYERS;

  const state1 = useGameState();
  const state2 = useGameState();
  const questions1 = useQuestions();
  const questions2 = useQuestions();

  const gameStates = { [p1.id]: state1, [p2.id]: state2 };
  const questionStates = { [p1.id]: questions1, [p2.id]: questions2 };

  const [activeShopId, setActiveShopId] = useState({ [p1.id]: null, [p2.id]: null });
  const [pendingItem, setPendingItem] = useState({ [p1.id]: null, [p2.id]: null });
  const [lastUnlock, setLastUnlock] = useState({ [p1.id]: null, [p2.id]: null });

  const [phase, setPhase] = useState('prep');
  const [prepSecondsLeft, setPrepSecondsLeft] = useState(PREP_DURATION_SECONDS);
  const [winnerId, setWinnerId] = useState(null);
  const [restartKey, setRestartKey] = useState(0);

  // --- world -> rules bridge (see game/gameEvents.js) ---------------------
  useEffect(() => {
    const handleDamage = ({ playerId, amount }) => gameStates[playerId]?.takeDamage(amount);
    const handleShopZone = ({ playerId, shopId }) => {
      setActiveShopId((prev) => ({ ...prev, [playerId]: shopId }));
      if (!shopId) {
        setPendingItem((prev) => ({ ...prev, [playerId]: null }));
        questionStates[playerId]?.clearQuestion();
      }
    };

    gameEvents.on('player-damaged', handleDamage);
    gameEvents.on('shop-zone', handleShopZone);
    return () => {
      gameEvents.off('player-damaged', handleDamage);
      gameEvents.off('shop-zone', handleShopZone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey]);

  // Energy regen for both players.
  useEffect(() => {
    const id = setInterval(() => {
      state1.regenEnergy(0.5);
      state2.regenEnergy(0.5);
    }, 500);
    return () => clearInterval(id);
  }, [state1, state2]);

  // Keep the scene's on-sprite health bars in sync.
  useEffect(() => {
    gameEvents.emit('health-changed', { playerId: p1.id, health: state1.health, maxHealth: state1.maxHealth });
  }, [p1.id, state1.health, state1.maxHealth]);
  useEffect(() => {
    gameEvents.emit('health-changed', { playerId: p2.id, health: state2.health, maxHealth: state2.maxHealth });
  }, [p2.id, state2.health, state2.maxHealth]);

  // Prep countdown -> battle.
  useEffect(() => {
    if (phase !== 'prep') return undefined;
    if (prepSecondsLeft <= 0) {
      setPhase('battle');
      gameEvents.emit('phase-changed', { phase: 'battle' });
      return undefined;
    }
    const id = setTimeout(() => setPrepSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, prepSecondsLeft]);

  // Win condition.
  useEffect(() => {
    if (phase !== 'battle') return;
    if (state1.health <= 0) {
      setWinnerId(p2.id);
      setPhase('over');
      gameEvents.emit('phase-changed', { phase: 'over' });
    } else if (state2.health <= 0) {
      setWinnerId(p1.id);
      setPhase('over');
      gameEvents.emit('phase-changed', { phase: 'over' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state1.health, state2.health, phase]);

  const handleBuy = (playerId, item) => {
    setPendingItem((prev) => ({ ...prev, [playerId]: { item, progress: 0 } }));
    questionStates[playerId].nextQuestion();
  };

  const handleAnswer = (playerId, answerIndex) => {
    const correct = questionStates[playerId].checkAnswer(answerIndex);
    questionStates[playerId].clearQuestion();

    setPendingItem((prev) => {
      const current = prev[playerId];
      if (!current) return prev;

      if (!correct) {
        // Wrong answer: no progress lost, just try again.
        questionStates[playerId].nextQuestion();
        return prev;
      }

      const progress = current.progress + 1;
      if (progress >= current.item.unlockCost) {
        gameStates[playerId].unlockAbility(current.item);
        setLastUnlock((prevUnlock) => ({ ...prevUnlock, [playerId]: current.item.name }));
        setTimeout(() => setLastUnlock((prevUnlock) => ({ ...prevUnlock, [playerId]: null })), 2500);
        return { ...prev, [playerId]: null };
      }

      questionStates[playerId].nextQuestion();
      return { ...prev, [playerId]: { ...current, progress } };
    });
  };

  const handleCast = (playerId, abilityName) => {
    const ability = gameStates[playerId].castAbility(abilityName);
    if (ability) gameEvents.emit('cast-ability', { playerId, ability });
  };

  const handleStartBattleNow = () => {
    setPhase('battle');
    gameEvents.emit('phase-changed', { phase: 'battle' });
  };

  const handleRestart = () => {
    state1.reset();
    state2.reset();
    setActiveShopId({ [p1.id]: null, [p2.id]: null });
    setPendingItem({ [p1.id]: null, [p2.id]: null });
    setLastUnlock({ [p1.id]: null, [p2.id]: null });
    setWinnerId(null);
    setPhase('prep');
    setPrepSecondsLeft(PREP_DURATION_SECONDS);
    setRestartKey((k) => k + 1);
  };

  return (
    <div className="game1-page">
      <h1>Game 1: Elemental Arena</h1>
      <p className="game1-hint">
        Explore the map and visit shops to unlock items by answering questions —
        stronger items take more correct answers. Once the timer runs out, battle begins.
      </p>

      <div className={`phase-banner ${phase === 'battle' ? 'battle' : ''}`}>
        {phase === 'prep' && (
          <>
            <span>🛒 Prep phase — shop and get ready: {prepSecondsLeft}s left</span>
            <button onClick={handleStartBattleNow}>Start Battle Now</button>
          </>
        )}
        {phase === 'battle' && <span>⚔️ Battle! Attacks are live.</span>}
        {phase === 'over' && (
          <span>
            🏆 {winnerId === p1.id ? p1.label : p2.label} wins!
          </span>
        )}
      </div>

      <div className="game-world">
        <GameCanvas key={restartKey} />
        {phase === 'over' && (
          <div className="game-over-overlay">
            <p>{winnerId === p1.id ? p1.label : p2.label} wins!</p>
            <button onClick={handleRestart}>Play Again</button>
          </div>
        )}
      </div>

      {(lastUnlock[p1.id] || lastUnlock[p2.id]) && (
        <div className="unlock-toast">
          {lastUnlock[p1.id] && `${p1.label} unlocked: ${lastUnlock[p1.id]}! `}
          {lastUnlock[p2.id] && `${p2.label} unlocked: ${lastUnlock[p2.id]}!`}
        </div>
      )}

      <div className="player-panels">
        {LOCAL_PLAYERS.map((config) => (
          <PlayerPanel
            key={config.id}
            config={config}
            gameState={gameStates[config.id]}
            questionState={questionStates[config.id]}
            activeShopId={activeShopId[config.id]}
            pending={pendingItem[config.id]}
            onBuy={(item) => handleBuy(config.id, item)}
            onAnswer={(answerIndex) => handleAnswer(config.id, answerIndex)}
            onCast={(abilityName) => handleCast(config.id, abilityName)}
          />
        ))}
      </div>
    </div>
  );
}
