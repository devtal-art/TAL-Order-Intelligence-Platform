import { useState, useEffect, useCallback } from 'react';
import { orderService } from '../services/orderService.js';

// Looks up a customer's assigned delivery days and holds the user's pick for
// a customer that has none yet.
//   known   — null while loading / lookup failed, true if days are already
//             assigned, false if this is a new customer (days required).
//   saved   — the days already assigned (when known).
//   days    — the draft selection (only meaningful when needsDays).
//   needsDays — true once we've confirmed this customer has no days yet.
//   persist() — saves the draft for a new customer (no-op otherwise).
// A failed lookup never blocks anything (known stays null).
export function useCustomerDeliveryDays(customerName) {
  const name = String(customerName || '').trim();
  const [state, setState] = useState({ loading: false, known: null, saved: [] });
  const [days, setDays] = useState([]);

  useEffect(() => {
    setDays([]);
    if (!name) {
      setState({ loading: false, known: null, saved: [] });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, known: null, saved: [] });
    // Debounced — the manual form calls this on every keystroke of the name.
    const t = setTimeout(() => {
      orderService
        .getCustomerDeliveryDays(name)
        .then((r) => {
          if (!cancelled) setState({ loading: false, known: Boolean(r.exists), saved: r.deliveryDays || [] });
        })
        .catch(() => {
          if (!cancelled) setState({ loading: false, known: null, saved: [] });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name]);

  const needsDays = Boolean(name) && state.known === false;
  const missing = state.loading || (needsDays && days.length === 0);

  const persist = useCallback(async () => {
    if (!needsDays || days.length === 0) return;
    await orderService.setCustomerDeliveryDays(name, days);
    setState({ loading: false, known: true, saved: days });
  }, [needsDays, days, name]);

  return { loading: state.loading, known: state.known, saved: state.saved, needsDays, days, setDays, missing, persist };
}
