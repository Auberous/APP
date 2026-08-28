import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import GameCanvas from '../components/GameCanvas.jsx';
import HUD from '../components/HUD.jsx';
import AbilityBar from '../components/AbilityBar.jsx';
import QuestionModal from '../components/QuestionModal.jsx';
import ShopPanel from '../components/ShopPanel.jsx';

import { abilities as ALL_ABILITIES } from '../game/abilities.js';
import { getShopById, getShopItems } from '../game/shops.js';
import { gameEvents } from '../game/gameEvents.js';
import { getSocket } from '../net/socket.js';

function toHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export default function Game1() {
  const location = useLocation();
  const { code, name } = location.state || {};

  const [youId, setYouId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [connectError, setConnectError] = useState(null);

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [pending, setPending] = useState(null); // { abilityName, progress, unlockCost }
  const [lastUnlock, setLastUnlock] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [now, setNow] = useState(Date.now());

  const youIdRef = useRef(null);

  // --- connect to the match, wire up the server <-> React <-> Phaser bridge
  useEffect(() => {
    if (!code || !name) return undefined;

    const socket = getSocket();

    socket.emit('arena:enter', {}, (res) => {
      if (!res?.ok) {
        setConnectError(res?.error || 'Could not enter the arena.');
        return;
      }
      youIdRef.current = res.youId;
      setYouId(res.youId);
      setSnapshot(res.snapshot);
      gameEvents.emit('net:snapshot', { snapshot: res.snapshot, youId: res.youId });
    });

    const handleState = (nextSnapshot) => {
      setSnapshot(nextSnapshot);
      gameEvents.emit('net:snapshot', { snapshot: nextSnapshot, youId: youIdRef.current });
    };
    const handleEffect = ({ effect }) => gameEvents.emit('net:effect', { effect });
    const handleClosed = () => setConnectError('The teacher closed this game.');
    const handleInputChanged = (input) => socket.emit('arena:input', input);

    socket.on('arena:state', handleState);
    socket.on('arena:effect', handleEffect);
    socket.on('room:closed', handleClosed);
    gameEvents.on('input-changed', handleInputChanged);

    return () => {
      socket.off('arena:state', handleState);
      socket.off('arena:effect', handleEffect);
      socket.off('room:closed', handleClosed);
      gameEvents.off('input-changed', handleInputChanged);
    };
  }, [code, name]);

  // Recompute the prep countdown display once a second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!code || !name) {
    return (
      <div className="game1-page">
        <h1>Game 1: Elemental Arena</h1>
        <p>You need to join a game first.</p>
        <Link to="/join">Go to Join Game</Link>
      </div>
    );
  }

  if (connectError) {
    return (
      <div className="game1-page">
        <h1>Game 1: Elemental Arena</h1>
        <p style={{ color: '#ff5c5c' }}>{connectError}</p>
        <Link to="/join">Back to Join Game</Link>
      </div>
    );
  }

  if (!snapshot || !youId) {
    return (
      <div className="game1-page">
        <h1>Game 1: Elemental Arena</h1>
        <p>Connecting...</p>
      </div>
    );
  }

  const me = snapshot.players.find((p) => p.id === youId);
  const others = snapshot.players.filter((p) => p.id !== youId);

  if (!me) {
    return (
      <div className="game1-page">
        <h1>Game 1: Elemental Arena</h1>
        <p>You're not in this match (it may have restarted).</p>
        <Link to="/join">Back to Join Game</Link>
      </div>
    );
  }

  const shop = me.shopId ? getShopById(me.shopId) : null;
  const shopItems = shop ? getShopItems(shop) : [];
  const unlockedAbilityObjs = me.unlockedAbilities
    .map((abilityName) => ALL_ABILITIES.find((a) => a.name === abilityName))
    .filter(Boolean);

  const socket = getSocket();

  const handleBuy = (item) => {
    setActionError(null);
    socket.emit('arena:shop-buy', { abilityName: item.name }, (res) => {
      if (!res?.ok) {
        setActionError(res?.error || 'Could not start that purchase.');
        return;
      }
      setPending({ abilityName: item.name, progress: 0, unlockCost: item.unlockCost });
      setCurrentQuestion(res.question);
    });
  };

  const handleAnswer = (answerIndex) => {
    socket.emit('arena:answer', { answerIndex }, (res) => {
      if (!res?.ok) {
        setActionError(res?.error || 'Something went wrong.');
        setCurrentQuestion(null);
        setPending(null);
        return;
      }
      if (res.unlocked) {
        setLastUnlock(res.abilityName);
        setTimeout(() => setLastUnlock(null), 2500);
        setCurrentQuestion(null);
        setPending(null);
        return;
      }
      setPending((prev) => (prev ? { ...prev, progress: res.progress ?? prev.progress } : prev));
      setCurrentQuestion(res.nextQuestion || null);
    });
  };

  const handleCast = (abilityName) => {
    setActionError(null);
    socket.emit('arena:cast-ability', { abilityName }, (res) => {
      if (!res?.ok) setActionError(res?.error || 'Could not use that ability.');
    });
  };

  const prepSecondsLeft = Math.max(0, Math.round((snapshot.prepEndsAt - now) / 1000));
  const winner = snapshot.phase === 'over' ? snapshot.players.find((p) => p.id === snapshot.winnerId) : null;

  return (
    <div className="game1-page">
      <h1>Game 1: Elemental Arena</h1>
      <p className="game1-hint">
        Explore the map and visit shops to unlock items by answering questions —
        stronger items take more correct answers. Once the timer runs out, battle begins.
      </p>

      <div className={`phase-banner ${snapshot.phase === 'battle' ? 'battle' : ''}`}>
        {snapshot.phase === 'prep' && <span>🛒 Prep phase — shop and get ready: {prepSecondsLeft}s left</span>}
        {snapshot.phase === 'battle' && <span>⚔️ Battle! Attacks are live.</span>}
        {snapshot.phase === 'over' && (
          <span>🏆 {winner ? winner.name : 'Someone'} wins!</span>
        )}
      </div>

      <div className="game-world">
        <GameCanvas />
        {snapshot.phase === 'over' && (
          <div className="game-over-overlay">
            <p>{winner ? winner.name : 'Someone'} wins!</p>
            <Link to="/join">Back to Lobby</Link>
          </div>
        )}
      </div>

      {lastUnlock && <div className="unlock-toast">Unlocked: {lastUnlock}!</div>}
      {actionError && <div className="unlock-toast" style={{ background: '#8a2f2f' }}>{actionError}</div>}

      <div className="player-panels">
        <div className="player-panel" style={{ '--player-color': toHex(me.color) }}>
          <div className="player-panel-label">
            <span className="player-color-dot" />
            {me.name} (you)
          </div>
          <HUD health={me.health} maxHealth={me.maxHealth} energy={me.energy} maxEnergy={me.maxEnergy} />
          <AbilityBar abilities={unlockedAbilityObjs} energy={me.energy} onCast={handleCast} />

          {currentQuestion ? (
            <QuestionModal
              question={currentQuestion.question}
              answers={currentQuestion.answers}
              onAnswer={handleAnswer}
            />
          ) : (
            shop && <ShopPanel shop={shop} items={shopItems} ownedNames={me.unlockedAbilities} onBuy={handleBuy} />
          )}

          {pending && currentQuestion && (
            <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
              Unlocking {pending.abilityName}: {pending.progress}/{pending.unlockCost} correct
            </p>
          )}
        </div>

        {others.length > 0 && (
          <div className="player-panel" style={{ '--player-color': '#3a3a4a' }}>
            <div className="player-panel-label">Other players ({others.length})</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {others.map((p) => (
                <li key={p.id}>
                  <span style={{ color: toHex(p.color) }}>●</span> {p.name} — {Math.round(p.health)}/{p.maxHealth} HP
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
