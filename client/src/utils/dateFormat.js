// Bridges the app's stored date format ('DD/MM/YYYY' free text — confirmed
// consistent across existing order_date values, see orderService.js) and the
// ISO 'YYYY-MM-DD' a native <input type="date"> requires/emits. Every date
// field keeps storing/sending DD/MM/YYYY exactly as before; only the input
// widget itself changed to a calendar picker.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Before the calendar picker existed, this was a free-text box (placeholder
// only, nothing enforced), so real stored values include day/month without
// a leading zero ('6/8/2026'), '-'/'.' separators, and 2-digit years, on top
// of the clean 'DD/MM/YYYY' case. Always read as DAY-MONTH-year, matching
// the app's one convention — see server/src/utils/dateUtil.js, which parses
// the same stored strings server-side and must stay in sync with this.
const DMY_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toFullYear(y) {
  return y <= 99 ? 2000 + y : y;
}

// Real calendar date check (rejects e.g. '31/02/2026', which Date would
// otherwise silently roll into March).
function isValidYMD(year, month, day) {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

// Stored value -> value for <input type="date">. Unparseable/blank values
// come back as '', so the calendar simply shows empty rather than guessing.
export function toDateInputValue(stored) {
  if (!stored) return '';
  const trimmed = stored.trim();
  if (ISO_RE.test(trimmed)) return trimmed;

  const m = DMY_RE.exec(trimmed);
  if (m) {
    const [, first, second, yy] = m;
    const year = toFullYear(Number(yy));
    const day = Number(first);
    const month = Number(second);
    // Primary reading: DAY/MONTH, this app's one convention.
    if (month >= 1 && month <= 12 && isValidYMD(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
    // Out-of-range "month" can only mean the fields were swapped (typed
    // MM/DD) — unambiguous recovery, not a guess. See
    // server/src/utils/dateUtil.js for the matching server-side logic.
    if (day >= 1 && day <= 12 && isValidYMD(year, day, month)) {
      return `${year}-${pad2(day)}-${pad2(month)}`;
    }
    return '';
  }

  // Spelled-out months ('26 August 2026', ...) are unambiguous regardless of
  // field order, so it's safe to hand these to the native date parser —
  // gated on containing a letter so purely numeric (potentially ambiguous
  // DD/MM vs MM/DD) strings never take this path.
  if (/[a-zA-Z]/.test(trimmed)) {
    const native = new Date(trimmed);
    if (!isNaN(native.getTime())) {
      return `${native.getFullYear()}-${pad2(native.getMonth() + 1)}-${pad2(native.getDate())}`;
    }
  }

  return '';
}

// <input type="date"> value ('YYYY-MM-DD' or '' when cleared) -> stored
// 'DD/MM/YYYY' format.
export function fromDateInputValue(isoValue) {
  if (!isoValue) return '';
  const m = ISO_RE.exec(isoValue);
  if (!m) return isoValue;
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}

// Stored value -> canonical 'DD/MM/YYYY' for display. Recovers readable text
// for the loosely-typed legacy values toDateInputValue already knows how to
// parse (missing leading zeros, '-'/'.' separators, spelled-out months, a
// stray MM/DD entry) — e.g. a raw '08/26/2026' displays as '26/08/2026'
// instead of a string that looks broken against this app's DD/MM/YYYY
// convention. Falls back to the raw stored text only if it truly can't be
// parsed, so nothing just disappears.
export function formatDisplayDate(stored) {
  const iso = toDateInputValue(stored);
  if (!iso) return stored || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Human label for a day-offset from today, e.g. for the Delivery Date
// sections (0 = today).
export function formatDaysUntil(n) {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}
