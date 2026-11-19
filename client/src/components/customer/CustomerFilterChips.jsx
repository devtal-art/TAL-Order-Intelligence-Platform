import { useEffect, useRef, useState } from 'react';

// Customer List filters as a row of chips — one per table column, in column
// order. Each chip opens a small popover: one-click presets for the common
// questions, plus a custom value/range. Active chips show their value and an
// × to remove them. The filter keys are the same ones the API already takes
// (see services/customer/customerService.js), so this is purely the UI.
export const EMPTY_CUSTOMER_FILTERS = {
  postCode: '',
  ordersMin: '', ordersMax: '',
  revenueMin: '', revenueMax: '',
  invoiced: '', invoicedMin: '', invoicedMax: '',
  avgMin: '', avgMax: '',
  lastDaysMin: '', lastDaysMax: '',
};

const isSet = (v) => String(v ?? '').trim() !== '';

// £1,000 → £1k, £2,500 → £2.5k, £1,234 → £1,234 (never rounds a typed value).
function money(sym, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${sym}${raw}`;
  if (Math.abs(n) >= 1000 && n % 100 === 0) return `${sym}${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

// "10–30", "10+", "up to 30" — shared wording for every range chip.
function rangeText(min, max, fmt) {
  if (isSet(min) && isSet(max)) return `${fmt(min)}–${fmt(max)}`;
  if (isSet(min)) return `${fmt(min)}+`;
  if (isSet(max)) return `up to ${fmt(max)}`;
  return '';
}

// Filter definitions. `keys` = every filter key the chip owns (cleared
// together); presets `set` a subset of them (the rest become '').
function buildDefs(sym) {
  const m = (v) => money(sym, v);
  return [
    {
      id: 'postcode',
      label: 'Postcode',
      kind: 'text',
      keys: ['postCode'],
      textKey: 'postCode',
      placeholder: 'e.g. UB4 or LE1 2',
      hint: 'Matches part of a postcode — spaces and capitals are ignored.',
      summary: (f) => String(f.postCode).toUpperCase(),
    },
    {
      id: 'orders',
      label: 'Orders',
      kind: 'range',
      keys: ['ordersMin', 'ordersMax'],
      minKey: 'ordersMin',
      maxKey: 'ordersMax',
      step: 1,
      presets: [
        { label: 'One-time customers (1 order)', short: '1 only', set: { ordersMax: '1' } },
        { label: 'Repeat customers (2+ orders)', short: '2+', set: { ordersMin: '2' } },
        { label: '5+ orders', short: '5+', set: { ordersMin: '5' } },
        { label: '10+ orders', short: '10+', set: { ordersMin: '10' } },
      ],
      summary: (f) => rangeText(f.ordersMin, f.ordersMax, String),
    },
    {
      id: 'ordered',
      label: 'Ordered Value',
      kind: 'range',
      keys: ['revenueMin', 'revenueMax'],
      minKey: 'revenueMin',
      maxKey: 'revenueMax',
      prefix: sym,
      presets: [
        { label: `Up to ${m(1000)}`, set: { revenueMax: '1000' } },
        { label: `${m(1000)}+`, set: { revenueMin: '1000' } },
        { label: `${m(5000)}+`, set: { revenueMin: '5000' } },
        { label: `${m(10000)}+`, set: { revenueMin: '10000' } },
        { label: `${m(25000)}+`, set: { revenueMin: '25000' } },
      ],
      summary: (f) => rangeText(f.revenueMin, f.revenueMax, m),
    },
    {
      id: 'invoiced',
      label: 'Invoiced',
      kind: 'range',
      keys: ['invoiced', 'invoicedMin', 'invoicedMax'],
      minKey: 'invoicedMin',
      maxKey: 'invoicedMax',
      prefix: sym,
      presets: [
        { label: 'Has Lit Invoice orders', short: 'Has Lit Invoice', set: { invoiced: 'yes' } },
        { label: 'No Lit Invoice orders', short: 'None', set: { invoiced: 'no' } },
        { label: `${m(5000)}+ invoiced`, short: `${m(5000)}+`, set: { invoicedMin: '5000' } },
        { label: `${m(10000)}+ invoiced`, short: `${m(10000)}+`, set: { invoicedMin: '10000' } },
      ],
      summary: (f) => {
        const range = rangeText(f.invoicedMin, f.invoicedMax, m);
        const status = f.invoiced === 'yes' ? 'Has Lit Invoice' : f.invoiced === 'no' ? 'None' : '';
        return [status, range].filter(Boolean).join(' · ');
      },
    },
    {
      id: 'avg',
      label: 'Avg Order Value',
      kind: 'range',
      keys: ['avgMin', 'avgMax'],
      minKey: 'avgMin',
      maxKey: 'avgMax',
      prefix: sym,
      presets: [
        { label: `Up to ${m(500)}`, set: { avgMax: '500' } },
        { label: `${m(500)}–${m(2000)}`, set: { avgMin: '500', avgMax: '2000' } },
        { label: `${m(2000)}+`, set: { avgMin: '2000' } },
      ],
      summary: (f) => rangeText(f.avgMin, f.avgMax, m),
    },
    {
      id: 'last',
      label: 'Last Ordered',
      kind: 'range',
      keys: ['lastDaysMin', 'lastDaysMax'],
      minKey: 'lastDaysMin',
      maxKey: 'lastDaysMax',
      step: 1,
      suffix: 'days',
      minPlaceholder: 'From',
      maxPlaceholder: 'To',
      customLabel: 'Custom (days ago)',
      presets: [
        { label: 'Within the last 7 days', short: 'Last 7 days', set: { lastDaysMax: '7' } },
        { label: 'Within the last 30 days', short: 'Last 30 days', set: { lastDaysMax: '30' } },
        { label: 'Not for 30+ days', short: '30+ days ago', set: { lastDaysMin: '30' } },
        { label: 'Not for 60+ days', short: '60+ days ago', set: { lastDaysMin: '60' } },
        { label: 'Not for 90+ days', short: '90+ days ago', set: { lastDaysMin: '90' } },
      ],
      summary: (f) => {
        const { lastDaysMin: a, lastDaysMax: b } = f;
        if (isSet(a) && isSet(b)) return `${a}–${b} days ago`;
        if (isSet(a)) return `${a}+ days ago`;
        if (isSet(b)) return `Last ${b} days`;
        return '';
      },
    },
  ];
}

const presetMatches = (def, preset, values) =>
  def.keys.every((k) => String(values[k] ?? '') === String(preset.set[k] ?? ''));

function FilterChip({ def, filters, onChange }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [draft, setDraft] = useState({});
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const active = def.keys.some((k) => isSet(filters[k]));
  const matched = def.presets?.find((p) => presetMatches(def, p, filters));
  const summary = active ? (matched ? matched.short || matched.label : def.summary(filters)) : '';

  // Fresh draft each time the popover opens; focus its first control.
  useEffect(() => {
    if (!open) return undefined;
    setDraft(Object.fromEntries(def.keys.map((k) => [k, filters[k] ?? ''])));
    const t = setTimeout(() => popRef.current?.querySelector('input, button')?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open
  }, [open]);

  // Outside click / Escape closes.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setAlignRight(r.left + 320 > window.innerWidth - 16);
    }
    setOpen((o) => !o);
  }

  // Writes this chip's keys (anything not in `values` is cleared).
  function commit(values) {
    onChange({ ...filters, ...Object.fromEntries(def.keys.map((k) => [k, values[k] ?? ''])) });
    setOpen(false);
  }

  function applyCustom(e) {
    e.preventDefault();
    if (def.kind === 'text') {
      commit({ [def.textKey]: String(draft[def.textKey] ?? '').trim() });
      return;
    }
    let lo = String(draft[def.minKey] ?? '').trim();
    let hi = String(draft[def.maxKey] ?? '').trim();
    if (isSet(lo) && isSet(hi) && Number(lo) > Number(hi)) [lo, hi] = [hi, lo]; // typed backwards
    commit({ [def.minKey]: lo, [def.maxKey]: hi });
  }

  const setDraftKey = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const numberInput = (key, placeholder, aria) => (
    <div className="ci-pop-num">
      {def.prefix && <span className="ci-pop-adorn ci-pop-adorn--pre" aria-hidden="true">{def.prefix}</span>}
      <input
        type="number"
        min="0"
        step={def.step || 'any'}
        inputMode="decimal"
        value={draft[key] ?? ''}
        onChange={setDraftKey(key)}
        placeholder={placeholder}
        aria-label={aria}
        className={[def.prefix && 'has-pre', def.suffix && 'has-suf'].filter(Boolean).join(' ') || undefined}
      />
      {def.suffix && <span className="ci-pop-adorn ci-pop-adorn--suf" aria-hidden="true">{def.suffix}</span>}
    </div>
  );

  return (
    <div className="ci-chip-wrap" ref={wrapRef}>
      <div className={`ci-chip${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}>
        <button
          ref={btnRef}
          type="button"
          className="ci-chip-main"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
        >
          <span className="ci-chip-label">{def.label}</span>
          {active ? (
            <span className="ci-chip-value">{summary}</span>
          ) : (
            <svg className="ci-chip-caret" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
          )}
        </button>
        {active && (
          <button type="button" className="ci-chip-x" aria-label={`Remove ${def.label} filter`} onClick={() => commit({})}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        )}
      </div>

      {open && (
        <div ref={popRef} className={`ci-pop${alignRight ? ' ci-pop--right' : ''}`} role="dialog" aria-label={`${def.label} filter`}>
          <div className="ci-pop-title">{def.label}</div>

          {def.presets?.length > 0 && (
            <div className="ci-pop-presets">
              {def.presets.map((p) => {
                const on = presetMatches(def, p, filters);
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={`ci-preset${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => (on ? commit({}) : commit(p.set))}
                  >
                    <span className="ci-preset-dot" aria-hidden="true" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          <form className="ci-pop-custom" onSubmit={applyCustom}>
            {def.presets?.length > 0 && <div className="ci-pop-sub">{def.customLabel || 'Custom range'}</div>}
            {def.kind === 'text' ? (
              <>
                <input
                  type="text"
                  className="ci-pop-text"
                  value={draft[def.textKey] ?? ''}
                  onChange={setDraftKey(def.textKey)}
                  placeholder={def.placeholder}
                  aria-label={def.label}
                  autoComplete="off"
                />
                {def.hint && <p className="ci-pop-hint">{def.hint}</p>}
              </>
            ) : (
              <div className="ci-pop-range">
                {numberInput(def.minKey, def.minPlaceholder || 'Min', `${def.label} from`)}
                <span className="ci-pop-sep" aria-hidden="true">–</span>
                {numberInput(def.maxKey, def.maxPlaceholder || 'Max', `${def.label} to`)}
              </div>
            )}
            <div className="ci-pop-actions">
              <button type="button" className="ci-pop-clear" onClick={() => commit({})} disabled={!active}>Clear</button>
              <button type="submit" className="ci-pop-apply">Apply</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Active filters as readable text, exactly as the chips show them
// (e.g. "Last Ordered: 30+ days ago") — used by the Excel export header.
export function describeCustomerFilters(filters, currencySymbol = '£') {
  return buildDefs(currencySymbol)
    .filter((def) => def.keys.some((k) => isSet(filters[k])))
    .map((def) => {
      const matched = def.presets?.find((p) => presetMatches(def, p, filters));
      return `${def.label}: ${matched ? matched.short || matched.label : def.summary(filters)}`;
    });
}

export default function CustomerFilterChips({ filters, onChange, onClearAll, currencySymbol = '£' }) {
  const defs = buildDefs(currencySymbol);
  const anyActive = defs.some((d) => d.keys.some((k) => isSet(filters[k])));
  return (
    <div className="ci-chips" role="group" aria-label="Filter customers">
      {defs.map((def) => (
        <FilterChip key={def.id} def={def} filters={filters} onChange={onChange} />
      ))}
      {anyActive && (
        <button type="button" className="ci-chips-clear" onClick={onClearAll}>Clear all</button>
      )}
    </div>
  );
}
