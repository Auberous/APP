export default function AbilityButton({ name, cost, onActivate, disabled }) {
  return (
    <button onClick={onActivate} disabled={disabled}>
      {name} ({cost})
    </button>
  );
}
