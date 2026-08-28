import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="page-shell">
      <h1 className="pixel-heading brand-title" style={{ fontSize: 16 }}>
        Teacher Dashboard
      </h1>

      <div className="card">
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleCreateGame} disabled={status === 'creating'}>
            {status === 'creating' ? 'Creating...' : 'Create Game'}
          </button>
          <button className="btn" onClick={handleViewResults}>
            View Results
          </button>
        </div>

        {error && <p className="status-error">{error}</p>}

        {roomCode && status !== 'closed' && (
          <>
            <div className="room-code-display">{roomCode}</div>
            <p className="hint-text">Students join at /join with this code.</p>

            <h2>Players ({players.length})</h2>
            <ul className="roster-list">
              {players.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
              {players.length === 0 && <li className="roster-empty">Waiting for students to join…</li>}
            </ul>
            <p className="hint-text">
              Players are assigned to Red or Blue automatically as they enter the arena.
            </p>
          </>
        )}

        {status === 'closed' && <p className="status-error">This game's room was closed.</p>}
      </div>

      <Link to="/" className="hint-text">
        ← Back home
      </Link>
    </div>
  );
}
