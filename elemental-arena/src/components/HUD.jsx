function Bar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="hud-bar">
      <span className="hud-bar-label">
        {label}: {value}/{max}
      </span>
      <div className="hud-bar-track">
        <div
          className="hud-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function HUD({ health, maxHealth = 100, energy, maxEnergy = 100 }) {
  return (
    <div className="hud">
      <Bar label="Health" value={health} max={maxHealth} color="#ff5c5c" />
      <Bar label="Energy" value={energy} max={maxEnergy} color="#7fd8ff" />
    </div>
  );
}
