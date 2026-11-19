import { statusMeta } from '../../utils/order.js';

// Generates a stable 1-2 letter avatar from a company name — first letters
// of the first two "words" (skipping short connector words like "the"/"ltd").
function initialsFor(name) {
  const stopWords = new Set(['the', 'and', 'of', 'ltd', 'limited', 'llc', 'inc']);
  const words = String(name || '')
    .split(/\s+/)
    .filter((w) => w && !stopWords.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  const source = words.length ? words : String(name || '').split(/\s+/).filter(Boolean);
  const letters = source.slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, '')[0] || '');
  return (letters.join('') || '?').toUpperCase();
}

// Deterministic accent for the avatar background, derived from the name so
// the same customer always gets the same color across visits.
const AVATAR_HUES = ['#2F4FA2', '#0F6B43', '#B54708', '#8F5E0A', '#6D28D9', '#0E7490'];
function hueFor(name) {
  let hash = 0;
  for (let i = 0; i < String(name).length; i++) hash = (hash * 31 + String(name).charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Customer Profile header — avatar (generated from company initials),
// company name/location, and the "since / last activity / latest status"
// badge row (Phase 2, feature 1: Customer Profile).
export default function ProfileHeader({ profile }) {
  const meta = statusMeta(profile.financials.latestOrderStatus);
  return (
    <div className="ci-profile-header">
      <div className="ci-avatar" style={{ background: hueFor(profile.customerName) }} aria-hidden="true">
        {initialsFor(profile.customerName)}
      </div>
      <div className="ci-profile-header-info">
        <h2 className="ci-profile-name">{profile.customerName}</h2>
        {profile.lastKnownAddress?.city && (
          <p className="ci-profile-location">
            {[profile.lastKnownAddress.city, profile.lastKnownAddress.country].filter(Boolean).join(', ')}
            {profile.lastKnownAddress.post_code ? ` · ${profile.lastKnownAddress.post_code}` : ''}
          </p>
        )}
        <div className="ci-profile-badges">
          <span className="ci-profile-badge">Customer since {formatDate(profile.financials.firstOrderDate)}</span>
          <span className="ci-profile-badge">Last active {formatDate(profile.financials.lastOrderDate)}</span>
          <span className={`og-status og-status-${meta.tone}`}>Latest order: {meta.label}</span>
        </div>
      </div>
    </div>
  );
}
