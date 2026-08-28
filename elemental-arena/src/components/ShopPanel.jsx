export default function ShopPanel({ shop, items, ownedNames, onBuy }) {
  if (!shop) return null;

  return (
    <div className="shop-panel">
      <h3>{shop.name}</h3>
      <p className="shop-panel-hint">Answer a question correctly to unlock an item for free.</p>
      <ul>
        {items.map((item) => {
          const owned = ownedNames.includes(item.name);
          return (
            <li key={item.name}>
              <div className="shop-item-info">
                <strong>{item.name}</strong>
                <span>{item.description}</span>
              </div>
              <button disabled={owned} onClick={() => onBuy(item)}>
                {owned ? 'Owned' : 'Unlock'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
