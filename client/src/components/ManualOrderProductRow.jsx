import { useRef, useState } from 'react';

// One product row for Manual Order Creation (V3.1 — new). Any of the three
// identity fields (Item Number / Website Product Name / Email Product Name)
// triggers the shared smart lookup (Approved Mappings first, Product Catalog
// fallback — Cases 1-4 from the spec): picking a suggestion autofills all
// three fields. Typing something no lookup finds is allowed — nothing here
// ever blocks manual entry.
export default function ManualOrderProductRow({ row, index, onChange, onRemove, canRemove, lookupProduct }) {
  const [suggestions, setSuggestions] = useState({ mappings: [], catalogItems: [] });
  const [openField, setOpenField] = useState(null); // 'itemNo' | 'websiteProductName' | 'emailProductName' | null
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  const search = (field, value) => {
    onChange({ [field]: value });
    setOpenField(field);
    clearTimeout(timer.current);
    const q = value.trim();
    if (!q) {
      setSuggestions({ mappings: [], catalogItems: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const result = await lookupProduct(q);
      setSuggestions(result);
      setLoading(false);
    }, 300);
  };

  const pickMapping = (m) => {
    onChange({ itemNo: m.itemNo, websiteProductName: m.websiteProductName, emailProductName: m.emailProductName });
    setOpenField(null);
    setSuggestions({ mappings: [], catalogItems: [] });
  };

  const pickCatalogItem = (p) => {
    onChange({
      itemNo: p.itemNo,
      websiteProductName: p.websiteProductName,
      emailProductName: row.emailProductName || p.websiteProductName,
    });
    setOpenField(null);
    setSuggestions({ mappings: [], catalogItems: [] });
  };

  const closeDropdown = () => {
    // Delay so a click on a suggestion registers before the dropdown unmounts.
    setTimeout(() => setOpenField(null), 200);
  };

  const q = Number(row.qty) || 0;
  const unit = String(row.unitPrice ?? '').trim() === '' ? 0 : Number(row.unitPrice) || 0;
  const total = Math.round(unit * q * 100) / 100;

  const hasSuggestions = suggestions.mappings.length > 0 || suggestions.catalogItems.length > 0;
  const showDropdown = openField && (loading || hasSuggestions);

  const fieldWithDropdown = (field, label, placeholder) => (
    <label className="mor-field">
      <span>{label}</span>
      <div className="mor-lookup-wrap">
        <input
          type="text"
          value={row[field]}
          placeholder={placeholder}
          onChange={(e) => search(field, e.target.value)}
          onFocus={() => row[field] && setOpenField(field)}
          onBlur={closeDropdown}
          aria-label={label}
        />
        {showDropdown && openField === field && (
          <div className="mor-dropdown">
            {loading && <div className="mor-dropdown-note">Searching…</div>}
            {!loading && suggestions.mappings.map((m) => (
              <button
                key={m.id}
                type="button"
                className="mor-dropdown-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMapping(m)}
              >
                <span className="mor-dropdown-main">{m.websiteProductName}</span>
                <span className="mor-dropdown-sub">Item {m.itemNo} · from {m.emailProductName}</span>
              </button>
            ))}
            {!loading && suggestions.catalogItems.map((p) => (
              <button
                key={`${p.itemNo}::${p.websiteProductName}`}
                type="button"
                className="mor-dropdown-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickCatalogItem(p)}
              >
                <span className="mor-dropdown-main">{p.websiteProductName}</span>
                <span className="mor-dropdown-sub">Item {p.itemNo} · from catalog</span>
              </button>
            ))}
            {!loading && !hasSuggestions && <div className="mor-dropdown-note">No match — you can type freely.</div>}
          </div>
        )}
      </div>
    </label>
  );

  return (
    <div className="mor-row">
      <div className="mor-row-head">
        <span className="mor-row-n">#{index + 1}</span>
        <button
          type="button"
          className="mor-remove"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove product ${index + 1}`}
          title={canRemove ? 'Remove this product' : 'At least one product row is required'}
        >
          🗑
        </button>
      </div>
      <div className="mor-grid">
        {fieldWithDropdown('emailProductName', 'Email Product Name', 'e.g. Blue Widget 500ml')}
        {fieldWithDropdown('websiteProductName', 'Website Product Name', 'Search catalog / mappings…')}
        {fieldWithDropdown('itemNo', 'Item Number', 'Search by item no…')}

        <label className="mor-field mor-narrow">
          <span>Quantity</span>
          <input
            type="number"
            min={1}
            step={1}
            value={row.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
            aria-label="Quantity"
          />
        </label>
        <label className="mor-field mor-narrow">
          <span>Unit Price</span>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={row.unitPrice}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            aria-label="Unit price"
          />
        </label>
        <div className="mor-field mor-narrow mor-total">
          <span>Total</span>
          <b>{total.toFixed(2)}</b>
        </div>

        <label className="mor-field mor-notes">
          <span>Notes</span>
          <input
            type="text"
            value={row.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Optional"
            aria-label="Product notes"
          />
        </label>
      </div>
    </div>
  );
}
