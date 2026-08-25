// Flexible date parsing for free-text date fields (order_date / delivery_date
// are plain, unvalidated strings — see orderService.js). Before the calendar
// date picker (see client/src/utils/dateFormat.js) existed, these were typed
// into a plain text box with a 'DD/MM/YYYY' placeholder but nothing
// enforcing it, so real data includes day/month without a leading zero
// ('6/8/2026'), '-' or '.' separators, 2-digit years, and spelled-out months
// ('26 August 2026') alongside the clean 'DD/MM/YYYY' / ISO 'YYYY-MM-DD'
// cases. All of these are handled; only truly unparseable text (blank,
// gibberish) returns null.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Numeric day/month/year with '/', '-', or '.' as separator, 1-2 digit day
// and month, 2-4 digit year. Always read as DAY-MONTH-year (never
// month-day) — this app has only ever used DD/MM/YYYY, and guessing
// MM/DD for ambiguous values (e.g. '05/08') is exactly the bug that broke
// the old delivery-date sort (see orderService.js history).
const DMY_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;

function toFullYear(y) {
  if (y >= 100) return y;
  // 2-digit year: every order date in this system is recent/near-future
  // business data, never pre-2000.
  return 2000 + y;
}

function buildDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  // Reject dates JS silently rolled over (e.g. 31/02 -> 03/03).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

// Returns a Date at local midnight for a recognizable date string, or null
// if it can't be confidently parsed.
export function parseFlexibleDate(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = ISO_RE.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return buildDate(Number(y), Number(m), Number(d));
  }

  const dmy = DMY_RE.exec(trimmed);
  if (dmy) {
    const [, first, second, y] = dmy;
    const year = toFullYear(Number(y));
    const day = Number(first);
    const month = Number(second);
    // Primary reading: DAY/MONTH, this app's one convention.
    if (month >= 1 && month <= 12) {
      const primary = buildDate(year, month, day);
      if (primary) return primary;
    }
    // The "month" field is out of range, so DD/MM cannot be right — the
    // only other possible reading is that the two fields were swapped
    // (typed MM/DD, e.g. a stray '08/26/2026' among otherwise-consistent
    // DD/MM data). This is unambiguous, not a guess: a real DD/MM value
    // never produces an out-of-range month, so this path only ever
    // triggers on values the primary reading already proved impossible.
    if (day >= 1 && day <= 12) {
      const swapped = buildDate(year, day, month);
      if (swapped) return swapped;
    }
    return null;
  }

  // Spelled-out months ('26 August 2026', 'Aug 26, 2026', ...) are
  // unambiguous regardless of field order, so it's safe to hand these to
  // the JS date parser rather than writing a month-name parser by hand.
  // Gated on containing a letter so purely numeric (and therefore
  // potentially ambiguous DD/MM vs MM/DD) strings never reach this path.
  if (/[a-zA-Z]/.test(trimmed)) {
    const native = new Date(trimmed);
    if (!isNaN(native.getTime())) {
      return new Date(native.getFullYear(), native.getMonth(), native.getDate());
    }
  }

  return null;
}

// Whole-day difference between two Date objects (both normalized to local
// midnight first, so partial-day time-of-day noise never skews the count).
export function daysBetween(date, from) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a - b) / 86400000);
}
