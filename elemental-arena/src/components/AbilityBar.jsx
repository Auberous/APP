import AbilityButton from './AbilityButton.jsx';

export default function AbilityBar({ abilities, energy, onCast }) {
  if (abilities.length === 0) {
    return <p className="ability-bar-empty">Answer questions to unlock abilities.</p>;
  }

  return (
    <div className="ability-bar">
      {abilities.map((ability) => (
        <AbilityButton
          key={ability.name}
          name={ability.name}
          cost={ability.cost}
          disabled={energy < ability.cost}
          onActivate={() => onCast(ability.name)}
        />
      ))}
    </div>
  );
}
