import { useEffect, useState } from 'react';

// Returns `value`, delayed by `delayMs` after it stops changing. Shared by
// every Customer Intelligence filter panel so a keystroke doesn't fire a
// request per character.
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
