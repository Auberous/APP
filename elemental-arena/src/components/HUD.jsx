export default function HUD({ health, energy }) {
  return (
    <div className="hud">
      <div className="hud-stat">Health: {health}</div>
      <div className="hud-stat">Energy: {energy}</div>
    </div>
  );
}
