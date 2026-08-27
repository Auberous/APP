export default function AbilityButton({ name, cost, onActivate }) {
  return (
    <button onClick={onActivate}>
      {name} ({cost})
    </button>
  );
}
