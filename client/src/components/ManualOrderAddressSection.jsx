import { useRef, useState } from 'react';

const ADDRESS_FIELDS = [
  ['contact_name', 'Contact Name'],
  ['address', 'Address'],
  ['city', 'City'],
  ['county', 'County'],
  ['country', 'Country'],
  ['post_code', 'Post Code'],
  ['phone', 'Phone'],
];

// Company + billing/delivery address entry for Manual Order Creation (V3.1 —
// new). Mirrors billing_address/delivery_address exactly as parseOrderHTML.js
// produces them, so downstream postcode display (Dashboard/Search) works
// identically for manual orders. Company Name autocompletes against saved
// orders (orderService.autocompleteCompanies, existing endpoint); picking a
// suggestion prefills the whole address from that company's latest order.
export default function ManualOrderAddressSection({
  companyName,
  setCompanyName,
  companySuggestions,
  onSearchCompany,
  onPickCompany,
  billing,
  updateBilling,
  sameAsBilling,
  setSameAsBilling,
  delivery,
  updateDelivery,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const timer = useRef(null);

  const handleCompanyInput = (value) => {
    setCompanyName(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearchCompany(value), 300);
    setShowDropdown(true);
  };

  return (
    <div className="mo-section">
      <div className="mo-section-title">Company &amp; Address</div>

      <label className="mo-field">
        <span>Company Name<em>*</em></span>
        <div className="mo-autocomplete-wrap">
          <input
            type="text"
            value={companyName}
            onChange={(e) => handleCompanyInput(e.target.value)}
            onFocus={() => companyName && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Start typing a company name…"
            aria-label="Company name"
            required
          />
          {showDropdown && companySuggestions.length > 0 && (
            <div className="mo-autocomplete-dropdown">
              {companySuggestions.map((s) => (
                <button
                  key={s.companyName}
                  type="button"
                  className="mo-autocomplete-row"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPickCompany(s);
                    setShowDropdown(false);
                  }}
                >
                  <span>{s.companyName}</span>
                  <span className="mo-autocomplete-meta">{s.orderCount} order{s.orderCount > 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </label>

      <div className="mo-address-grid">
        {ADDRESS_FIELDS.map(([key, label]) => (
          <label className="mo-field" key={key}>
            <span>{label}</span>
            <input
              type="text"
              value={billing[key]}
              onChange={(e) => updateBilling({ [key]: e.target.value })}
              aria-label={`Billing ${label}`}
            />
          </label>
        ))}
      </div>

      <label className="mo-checkbox">
        <input
          type="checkbox"
          checked={sameAsBilling}
          onChange={(e) => setSameAsBilling(e.target.checked)}
        />
        Delivery address same as billing
      </label>

      {!sameAsBilling && (
        <div className="mo-address-grid mo-delivery-grid">
          {ADDRESS_FIELDS.map(([key, label]) => (
            <label className="mo-field" key={key}>
              <span>Delivery {label}</span>
              <input
                type="text"
                value={delivery[key]}
                onChange={(e) => updateDelivery({ [key]: e.target.value })}
                aria-label={`Delivery ${label}`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
