import { useState } from 'react';

export default function JoinGame() {
  const [gameCode, setGameCode] = useState('');

  const handleJoin = () => {
    // Placeholder: multiplayer join logic will be wired up later.
    console.log('Join game with code:', gameCode);
  };

  return (
    <div>
      <h1>Join Game</h1>
      <input
        type="text"
        value={gameCode}
        onChange={(e) => setGameCode(e.target.value)}
        placeholder="Enter game code"
      />
      <button onClick={handleJoin}>Join Game</button>
    </div>
  );
}
