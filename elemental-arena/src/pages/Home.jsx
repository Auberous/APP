import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div>
      <h1>Elemental Arena</h1>
      <nav>
        <ul>
          <li>
            <Link to="/join">Join Game</Link>
          </li>
          <li>
            <Link to="/teacher">Teacher Dashboard</Link>
          </li>
          <li>
            <Link to="/game1">Game 1</Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
