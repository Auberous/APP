import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket.js';

export default function TeacherDashboard() {
  const [roomCode, setRoomCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | creating | open | closed | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = getSocket();

    const handlePlayersUpdated = ({ players: list }) => setPlayers(list);
    const handleClosed = () => setStatus('closed');
    const handleConnectError = () => {
      setStatus('error');
      setError("Can't reach the game server. Is it running?");
    };

    socket.on('room:players-updated', handlePlayersUpdated);
    socket.on('room:closed', handleClosed);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('room:players-updated', handlePlayersUpdated);
      socket.off('room:closed', handleClosed);
      socket.off('connect_error', handleConnectError);
    };
  }, []);

  const handleCreateGame = () => {
    setStatus('creating');
    setError(null);
    const socket = getSocket();
    socket.emit('teacher:create-room', {}, (res) => {
      if (res?.ok) {
        setRoomCode(res.code);
        setPlayers([]);
        setStatus('open');
      } else {
        setStatus('error');
        setError(res?.error || 'Could not create a game.');
      }
    });
  };

  const handleViewResults = () => {
    // Placeholder: results view will be wired up once matches are tracked.
    console.log('View Results clicked');
  };

  return (
    <div>
      <h1>Teacher Dashboard</h1>

      <button onClick={handleCreateGame} disabled={status === 'creating'}>
        Create Game
      </button>
      <button onClick={handleViewResults}>View Results</button>

      {error && <p style={{ color: '#ff5c5c' }}>{error}</p>}

      {roomCode && status !== 'closed' && (
        <div>
          <p>
            Room code: <strong style={{ fontSize: 28, letterSpacing: 4 }}>{roomCode}</strong>
          </p>
          <p>Students join at /join with this code.</p>
          <h3>Players ({players.length})</h3>
          <ul>
            {players.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {players.length === 0 && <li>Waiting for students to join...</li>}
          </ul>
        </div>
      )}

      {status === 'closed' && <p>This game's room was closed.</p>}
    </div>
  );
}
