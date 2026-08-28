import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      <div>
        <h1>You're in!</h1>
        <p>
          Code <strong>{gameCode.toUpperCase()}</strong>
        </p>
        <h3>Players ({players.length})</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
        <button onClick={handleEnterArena}>Enter Arena</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Join Game</h1>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
      />
      <input
        type="text"
        value={gameCode}
        onChange={(e) => setGameCode(e.target.value)}
        placeholder="Enter game code"
      />
      <button onClick={handleJoin} disabled={!gameCode || !name || status === 'joining'}>
        Join Game
      </button>
      {error && <p style={{ color: '#ff5c5c' }}>{error}</p>}
    </div>
  );
}
