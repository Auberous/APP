const HITS_TO_DISABLE = 3;

export default function HUD({ teamName, teamColor, hitsTaken, disabled, respawnMsLeft }) {
  return (
    <div className="hud">
      <span className="hud-team-label" style={{ color: teamColor }}>
        {teamName}
      </span>
      {disabled ? (
        <span className="hud-respawn">Respawning… {Math.ceil(respawnMsLeft / 1000)}s</span>
      ) : (
        <div className="hud-pips">
          {Array.from({ length: HITS_TO_DISABLE }).map((_, i) => (
            <span key={i} className={`hud-pip ${i < hitsTaken ? 'hit' : ''}`} />
          ))}
          <span className="hud-pips-label">
            {hitsTaken}/{HITS_TO_DISABLE} hits
          </span>
        </div>
      )}
    </div>
  );
}
