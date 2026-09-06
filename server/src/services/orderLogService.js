import { OrderLog } from '../models/orderLog.model.js';

// ────────────────────────────────────────────────
//  ORDER LOG SERVICE (Order Activity Log — new, additive)
//
//  Records one entry per order mutation (see orderLog.model.js for the
//  action enum) and reads them back for the per-order Activity Log section
//  and the Dashboard's cross-order Recent Activity feed.
// ────────────────────────────────────────────────

const clampInt = (raw, def, min, max) => {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

// Duplicated (not imported) from orderService.js — that file already
// imports recordLog from this one, so importing back would create a
// circular module dependency.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Write one log entry. Deliberately swallows its own errors — a logging
// failure must never fail the real mutation, which has already succeeded by
// the time every call site below invokes this.
export async function recordLog({ portalOrderRef, actor, actorRole, action, message, details }) {
  try {
    await OrderLog.create({
      portal_order_ref: portalOrderRef,
      actor,
      actor_role: actorRole || '',
      action,
      message,
      details: details ?? {},
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`orderLogService.recordLog failed (action=${action}, ref=${portalOrderRef}):`, err.message);
  }
}

export function toLogDto(doc) {
  return {
    id: doc._id,
    portalOrderRef: doc.portal_order_ref,
    action: doc.action,
    actor: doc.actor,
    actorRole: doc.actor_role || '',
    message: doc.message,
    details: doc.details || {},
    createdAt: doc.created_at instanceof Date ? doc.created_at.toISOString() : doc.created_at,
  };
}

// Paginated, newest-first history for one order.
export async function getOrderLogs(portalOrderRef, { page, limit } = {}) {
  const pageN = clampInt(page, 1, 1, 100000);
  const limitN = clampInt(limit, 25, 1, 100);

  const filter = { portal_order_ref: portalOrderRef };
  const [docs, total] = await Promise.all([
    OrderLog.find(filter)
      .sort({ created_at: -1 })
      .skip((pageN - 1) * limitN)
      .limit(limitN)
      .lean(),
    OrderLog.countDocuments(filter),
  ]);

  return {
    data: docs.map(toLogDto),
    meta: { total, page: pageN, limit: limitN, pages: Math.max(1, Math.ceil(total / limitN)) },
  };
}

// Cross-order, newest-first feed — powers both the Dashboard's Recent
// Activity widget (paged, no filters) and its "View All" page (paged, plus
// optional date/order-number filters). `date` is a 'YYYY-MM-DD' string from
// a plain <input type="date">; parsed into Y/M/D directly (not `new
// Date(str)`, which parses date-only ISO strings as UTC and can roll the
// day backward/forward depending on server timezone) so the day-boundary
// range always matches the calendar day the user actually picked.
// Column -> computed sort key, mirrors orderService.js's listDashboardOrders
// SORT_KEY_EXPR exactly for the same reason: portal_order_ref is a
// numeric-looking String ("100" would otherwise sort before "99"), and
// actor/message should sort case-insensitively.
const LOG_SORT_KEY_EXPR = {
  ref: { $convert: { input: '$portal_order_ref', to: 'int', onError: 0, onNull: 0 } },
  actor: { $toLower: { $ifNull: ['$actor', ''] } },
  message: { $toLower: { $ifNull: ['$message', ''] } },
  when: '$created_at',
};

export async function getRecentLogs({ page, limit, date, portalOrderRef, actor, sortBy, sortDir } = {}) {
  const pageN = clampInt(page, 1, 1, 100000);
  const limitN = clampInt(limit, 10, 1, 50);
  const dir = sortDir === 'asc' ? 1 : -1;
  const sortKeyExpr = LOG_SORT_KEY_EXPR[sortBy] || LOG_SORT_KEY_EXPR.when;

  const filter = {};
  if (portalOrderRef) {
    filter.portal_order_ref = new RegExp(escapeRegex(portalOrderRef), 'i');
  }
  // Exact match — the client only ever sends one of the known account names
  // (a <select>, not free text), same convention orderService.js's
  // listDashboardOrders uses for its own 'processor' filter.
  if (actor) {
    filter.actor = actor;
  }
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const start = new Date(Number(y), Number(m) - 1, Number(d));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.created_at = { $gte: start, $lt: end };
  }

  const [agg] = await OrderLog.aggregate([
    { $match: filter },
    { $addFields: { _sortKey: sortKeyExpr } },
    // created_at as a tiebreaker keeps same-value rows (e.g. two entries by
    // the same actor) in a stable, still-newest-first order.
    { $sort: { _sortKey: dir, created_at: -1 } },
    {
      $facet: {
        data: [{ $skip: (pageN - 1) * limitN }, { $limit: limitN }],
        count: [{ $count: 'n' }],
      },
    },
  ]);

  const total = agg?.count?.[0]?.n ?? 0;
  return {
    data: (agg?.data || []).map(toLogDto),
    meta: { total, page: pageN, limit: limitN, pages: Math.max(1, Math.ceil(total / limitN)) },
  };
}
