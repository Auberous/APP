import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSocket } from '../net/socket.js';

export default function JoinGame() {
  const navigate = useNavigate();
  const [gameCode, setGameCode] = useState('');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | joining | joined | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = getSocket();

    const handlePlayersUpdated = ({ players: list }) => setPlayers(list);
    const handleClosed = () => {
      setStatus('error');
      setError('The teacher closed this game.');
    };

    socket.on('room:players-updated', handlePlayersUpdated);
    socket.on('room:closed', handleClosed);

    return () => {
      socket.off('room:players-updated', handlePlayersUpdated);
      socket.off('room:closed', handleClosed);
    };
  }, []);

  const handleJoin = () => {
    setStatus('joining');
    setError(null);
    const socket = getSocket();
    const trimmedCode = gameCode.trim().toUpperCase();
    socket.emit('player:join-room', { code: trimmedCode, name }, (res) => {
      if (res?.ok) {
        setPlayers(res.players);
        setStatus('joined');
      } else {
        setStatus('error');
        setError(res?.error || 'Could not join that game.');
      }
    });
  };

  const handleEnterArena = () => {
    navigate('/game1', { state: { code: gameCode.trim().toUpperCase(), name } });
  };

  if (status === 'joined') {
    return (
      <div className="page-shell">
        <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
          You're in!
        </h1>
        <div className="card">
          <div className="room-code-display">{gameCode.toUpperCase()}</div>

          <h2>Players ({players.length})</h2>
          <ul className="roster-list">
            {players.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>

          <button className="btn btn-primary" onClick={handleEnterArena}>
            Enter Arena →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
        Join Game
      </h1>

      <div className="card">
        <input
          className="text-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <input
          className="text-input"
          type="text"
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value)}
          placeholder="Game code"
          style={{ textTransform: 'uppercase', letterSpacing: 2 }}
        />
        <button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={!gameCode || !name || status === 'joining'}
        >
          {status === 'joining' ? 'Joining...' : 'Join Game'}
        </button>
        {error && <p className="status-error">{error}</p>}
      </div>

      <Link to="/" className="hint-text">
        ← Back home
      </Link>
    </div>
  );
}
