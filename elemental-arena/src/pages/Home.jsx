import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="page-shell">
      <h1 className="pixel-heading brand-title">Elemental Arena</h1>
      <p className="brand-subtitle">Answer questions. Unlock power. Battle.</p>

      <ul className="nav-links">
        <li>
          <Link className="nav-link" to="/join">
            🎮 Join Game
          </Link>
        </li>
        <li>
          <Link className="nav-link" to="/teacher">
            🧑‍🏫 Teacher Dashboard
          </Link>
        </li>
        <li>
          <Link className="nav-link" to="/game1">
            ⚔️ Game 1 (direct)
          </Link>
        </li>
      </ul>
    </div>
  );
}
