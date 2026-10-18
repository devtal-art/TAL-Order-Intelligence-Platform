import { useState } from 'react';

// Preset Order Comment choices. The chosen text itself is what gets stored in
// order.orderComment (same free-text field as before), so nothing server-side
// or on the Dashboard changes. 'Other' is a UI-only choice that reveals a text
// box; whatever is typed there is stored. Comments saved before this dropdown
// existed (any text not in this list) open as 'Other' with their text intact.
export const ORDER_COMMENT_PRESETS = [
  'Customer Blocked (CX Blocked)',
  'Out of Stock(OOS)',
  'Next Week Delivery',
  'Sales Rep Confirmation',
  'Awaiting Follow Up',
];
const OTHER = 'Other';

export default function OrderCommentField({ id, value = '', onChange }) {
  // Remembers that 'Other' was picked while its text box is still empty
  // (an empty value alone can't tell "no comment" from "Other, nothing typed").
  const [otherPicked, setOtherPicked] = useState(false);

  const isPreset = ORDER_COMMENT_PRESETS.includes(value);
  const selected = isPreset ? value : value !== '' || otherPicked ? OTHER : '';

  const handleSelect = (e) => {
    const next = e.target.value;
    if (next === OTHER) {
      setOtherPicked(true);
      // Switching from a preset to Other starts with an empty text box.
      if (isPreset) onChange('');
    } else {
      setOtherPicked(false);
      onChange(next);
    }
  };

  return (
    <div className="oc-field">
      <select
        id={id}
        className="os-select"
        value={selected}
        onChange={handleSelect}
        aria-label="Order Comment"
      >
        <option value="">No comment</option>
        {ORDER_COMMENT_PRESETS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
        <option value={OTHER}>{OTHER}</option>
      </select>
      {selected === OTHER && (
        <input
          type="text"
          className="os-comment-input oc-other-input"
          placeholder="Type the comment…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Order Comment (other)"
        />
      )}
    </div>
  );
}
