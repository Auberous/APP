import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import GameCanvas from '../components/GameCanvas.jsx';
import HUD from '../components/HUD.jsx';

import { getTeamById } from '../game/teams.js';
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
  const [actionError, setActionError] = useState(null);

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
    const handlePunch = () => {
      socket.emit('arena:punch', {}, (res) => {
        if (!res?.ok) setActionError(res?.error || null);
      });
    };

    socket.on('arena:state', handleState);
    socket.on('arena:effect', handleEffect);
    socket.on('room:closed', handleClosed);
    gameEvents.on('input-changed', handleInputChanged);
    gameEvents.on('punch-pressed', handlePunch);

    return () => {
      socket.off('arena:state', handleState);
      socket.off('arena:effect', handleEffect);
      socket.off('room:closed', handleClosed);
      gameEvents.off('input-changed', handleInputChanged);
      gameEvents.off('punch-pressed', handlePunch);
    };
  }, [code, name]);

  if (!code || !name) {
    return (
      <div className="page-shell">
        <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
          Two-Base Arena
        </h1>
        <div className="card">
          <p>You need to join a game first.</p>
          <Link className="btn btn-primary" to="/join">
            Go to Join Game
          </Link>
        </div>
      </div>
    );
  }

  if (connectError) {
    return (
      <div className="page-shell">
        <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
          Two-Base Arena
        </h1>
        <div className="card">
          <p className="status-error">{connectError}</p>
          <Link className="btn btn-primary" to="/join">
            Back to Join Game
          </Link>
        </div>
      </div>
    );
  }

  if (!snapshot || !youId) {
    return (
      <div className="page-shell">
        <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
          Two-Base Arena
        </h1>
        <p className="hint-text">Connecting…</p>
      </div>
    );
  }

  const me = snapshot.players.find((p) => p.id === youId);
  const others = snapshot.players.filter((p) => p.id !== youId);

  if (!me) {
    return (
      <div className="page-shell">
        <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
          Two-Base Arena
        </h1>
        <div className="card">
          <p>You're not in this match (it may have restarted).</p>
          <Link className="btn btn-primary" to="/join">
            Back to Join Game
          </Link>
        </div>
      </div>
    );
  }

  const myTeam = getTeamById(me.team);

  return (
    <div className="game1-page">
      <h1 className="pixel-heading" style={{ fontSize: 16 }}>
        Two-Base Arena
      </h1>
      <p className="game1-hint">
        Move with WASD/arrows. Press Space to punch a nearby enemy — 3 hits disables them and
        sends them back to their barracks. You can't punch through walls or buildings, and
        punching is useless against machines.
      </p>

      <div className="game-world">
        <GameCanvas />
      </div>

      {actionError && (
        <div className="unlock-toast" style={{ background: '#8a2f2f' }}>
          {actionError}
        </div>
      )}

      <div className="player-panels">
        <div className="player-panel" style={{ '--player-color': toHex(me.color) }}>
          <div className="player-panel-label">
            <span className="player-color-dot" />
            {me.name} (you)
          </div>
          <HUD
            teamName={myTeam.name}
            teamColor={toHex(myTeam.color)}
            hitsTaken={me.hitsTaken}
            disabled={me.disabled}
            respawnMsLeft={me.respawnMsLeft}
          />
        </div>

        {others.length > 0 && (
          <div className="player-panel" style={{ '--player-color': '#3a3a4a' }}>
            <div className="player-panel-label">Other players ({others.length})</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {others.map((p) => {
                const team = getTeamById(p.team);
                return (
                  <li key={p.id}>
                    <span style={{ color: toHex(p.color) }}>●</span> {p.name} — {team?.name}
                    {p.disabled ? ' (respawning)' : ` — ${p.hitsTaken}/3 hits`}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
