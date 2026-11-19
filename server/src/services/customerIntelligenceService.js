import { Order } from '../models/order.model.js';
import { AppError } from '../utils/AppError.js';
import { CUSTOMER_GROUPS, groupForCustomer } from '../config/customerGroups.js';

// ────────────────────────────────────────────────
//  CUSTOMER INTELLIGENCE SERVICE (new, independent module)
//
//  READ-ONLY against the Orders collection — the Order Processing module's
//  source of truth is never written to from here. "Customer" is not a new
//  entity/collection; it is derived live by grouping Orders on customer_name
//  (the same identity key orderService.autocompleteCompanies already groups
//  by), exactly the way the existing operational Dashboard derives its
//  buckets live from Orders rather than from a duplicated summary store.
// ────────────────────────────────────────────────

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const clampInt = (raw, def, min, max) => {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toIso(d) {
  return d instanceof Date ? d.toISOString() : d;
}

// ── Lit Invoice amount (read-only re-derivation) ─────────────────────────
// The "Lit Invoice amount" shown on an order is never stored — Order
// Processing computes it in the browser (client/src/components/
// OrderFinancials.jsx, the "Updated" card relabelled when lit_invoice is
// ticked). This is a server-side MIRROR of that exact arithmetic so the
// Customer Intelligence list can sum it per customer. Order Processing's own
// code is untouched; if its formula ever changes, update this mirror too.
//
//   litTotal = financials.total + totalAdjustment
//   totalAdjustment, per resolution result (line):
//     Not Found comment            → − qty × |unit_price|
//     manual addition (HTML order) → ± qty × |unit_price| (− when price < 0)
//     OS comment                   → − pendingQty × |unit_price|
//                                    (pendingQty clamped 0…qty; whole qty if blank)
function osPendingQty(raw, orderedQty) {
  const ordered = Number(orderedQty) || 0;
  if (raw === null || raw === undefined || raw === '') return ordered;
  const n = Number(raw);
  if (!Number.isFinite(n)) return ordered;
  return Math.min(Math.max(n, 0), ordered);
}

function litInvoiceTotal(order) {
  const f = order.parsed_data?.financials || {};
  const lineItems = order.parsed_data?.line_items || [];
  const results = Array.isArray(order.resolution_data?.results) ? order.resolution_data.results : [];
  const comments = order.product_comments || {};
  const fulfillment = order.product_fulfillment || {};
  const isManualOrder = order.order_source === 'MANUAL';

  let totalAdjustment = 0;
  for (const r of results) {
    const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
    const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && lineItems[lineIndex]) || null;
    if (!item) continue;

    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const itemTotal = qty * Math.abs(unitPrice);
    const comment = comments[r.lineId] || '';
    const isNotFound = comment === 'Not Found';
    const isManual = !isManualOrder && r.source === 'manual_addition';
    const isNegative = !isManualOrder && unitPrice < 0;
    const osValue = comment === 'OS' ? osPendingQty(fulfillment[r.lineId]?.pendingQty, qty) * Math.abs(unitPrice) : 0;

    if (isNotFound) totalAdjustment -= itemTotal;
    else if (isManual) totalAdjustment += isNegative ? -itemTotal : itemTotal;
    totalAdjustment -= osValue;
  }

  // OrderFinancials shows only the adjustment when the order carries no
  // totals block at all (no sub total / discount / transport / total rows).
  const subTotal = Number(f.sub_total) || 0;
  const transport = Number(f.transportation_charges) || 0;
  const total = Number(f.total) || 0;
  const hasDiscount =
    (Array.isArray(f.discounts) && f.discounts.some((d) => Number(d.amount) !== 0)) || (Number(f.discount) || 0) !== 0;
  const hasTotalsRows = subTotal > 0 || transport > 0 || total > 0 || hasDiscount;

  return hasTotalsRows ? total + totalAdjustment : totalAdjustment;
}

// Lit Invoice amount per customer (sum + order count), over every
// Lit-Invoice-ticked order. The projection is deliberately MINIMAL — only the
// fields litInvoiceTotal() reads. The full documents (product-match data in
// resolution_data, line-item descriptions, addresses…) are many times larger
// and were the main cost of this query.
async function getInvoicedByCustomer() {
  const orders = await Order.find(
    { customer_name: { $nin: ['', null] }, lit_invoice: true },
    {
      _id: 0,
      customer_name: 1,
      order_source: 1,
      'parsed_data.financials.total': 1,
      'parsed_data.financials.sub_total': 1,
      'parsed_data.financials.transportation_charges': 1,
      'parsed_data.financials.discount': 1,
      'parsed_data.financials.discounts.amount': 1,
      'parsed_data.line_items.qty': 1,
      'parsed_data.line_items.unit_price': 1,
      'resolution_data.results.lineId': 1,
      'resolution_data.results.source': 1,
      product_comments: 1,
      product_fulfillment: 1,
    }
  ).lean();
  const map = new Map();
  for (const o of orders) {
    const entry = map.get(o.customer_name) || { value: 0, count: 0 };
    entry.value += litInvoiceTotal(o);
    entry.count += 1;
    map.set(o.customer_name, entry);
  }
  return map;
}

// One row per customer with every figure the Customer List shows or filters
// on. Built from TWO queries run in parallel (the customer aggregate + the
// Lit Invoice amounts); all filtering / sorting / paging then happens in
// memory — the platform has hundreds of customers, not millions, so this is
// far cheaper than re-running the aggregation per filter combination.
async function buildCustomerSummaries() {
  const [rows, invoiced] = await Promise.all([
    Order.aggregate([
      { $match: { customer_name: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$customer_name',
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ['$parsed_data.financials.total', 0] } },
          // Per-order line-item quantities summed, then summed again across
          // the group — avoids an $unwind of every order's line items.
          totalQuantity: {
            $sum: { $sum: { $map: { input: { $ifNull: ['$parsed_data.line_items', []] }, as: 'li', in: { $ifNull: ['$$li.qty', 0] } } } },
          },
          highestOrderValue: { $max: { $ifNull: ['$parsed_data.financials.total', 0] } },
          firstOrderDate: { $min: '$upload_timestamp' },
          lastOrderDate: { $max: '$upload_timestamp' },
          // Fields taken from the customer's LATEST order. $max over a
          // document compares field by field, so `ts` (first) decides — this
          // replaces a whole-collection $sort before the $group.
          latest: {
            $max: {
              ts: '$upload_timestamp',
              ref: '$portal_order_ref',
              currency: '$parsed_data.financials.currency',
              // Delivery postcode first, billing as fallback — same
              // precedence as getCustomerProfile's lastKnownAddress.
              postCode: {
                $let: {
                  vars: { d: { $trim: { input: { $toString: { $ifNull: ['$parsed_data.delivery_address.post_code', ''] } } } } },
                  in: {
                    $cond: [
                      { $ne: ['$$d', ''] },
                      '$$d',
                      { $trim: { input: { $toString: { $ifNull: ['$parsed_data.billing_address.post_code', ''] } } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    ]),
    getInvoicedByCustomer(),
  ]);

  return rows.map((c) => {
    const inv = invoiced.get(c._id);
    return {
      customerName: c._id,
      orderCount: c.orderCount,
      totalRevenue: c.totalRevenue || 0, // raw — rounded on output
      avgOrderValue: c.orderCount ? round2(c.totalRevenue / c.orderCount) : 0,
      totalQuantity: c.totalQuantity || 0,
      highestOrderValue: c.highestOrderValue || 0,
      currency: c.latest?.currency || 'GBP',
      firstOrderDate: c.firstOrderDate,
      lastOrderDate: c.lastOrderDate,
      latestOrderRef: c.latest?.ref,
      postCode: c.latest?.postCode || '',
      invoicedValue: round2(inv?.value || 0),
      invoicedOrderCount: inv?.count || 0,
    };
  });
}

// Short-lived in-memory cache of the summaries. Changing a filter, paging or
// re-sorting within this window costs no database round-trip at all; after
// it, the next request rebuilds from live data. Concurrent requests share one
// in-flight build. Read-only module, so the only effect is that an order
// edited in Order Processing shows up here within SUMMARY_TTL_MS.
const SUMMARY_TTL_MS = 20 * 1000;
let summaryCache = { at: 0, promise: null };

function getCustomerSummaries() {
  const now = Date.now();
  if (summaryCache.promise && now - summaryCache.at < SUMMARY_TTL_MS) return summaryCache.promise;
  const promise = buildCustomerSummaries();
  summaryCache = { at: now, promise };
  // A failed build must not be served from cache.
  promise.catch(() => {
    if (summaryCache.promise === promise) summaryCache = { at: 0, promise: null };
  });
  return promise;
}

// Known order resolution statuses — mirrors orderService's enum (order.model.js).
const RESOLUTION_STATUSES = ['needs_review', 'partially_resolved', 'resolved'];

// List customers (grouped, paginated, searchable), each with aggregate
// financial totals. `sort`: 'revenue' (default) | 'orders' | 'recent' | 'name'
// | 'quantity'.
//
// Order-level filters (additive, backward-compatible — every param is
// optional and defaults to "no filter"):
//   orderNumber — customers with an order whose portal_order_ref matches
//   product     — customers with a line item whose description matches
//   itemNo      — customers with a CONFIRMED catalog match for this item
//                 number (results[].match.itemNo — not suggestedProduct,
//                 which is only a candidate, never a confirmed purchase)
//   dateFrom/dateTo       — restrict to orders uploaded within this range
//   status                — customers with an order in this resolution_status
//
// Column filters (match the Customer List table, all optional):
//   postCode              — postcode contains (case/space-insensitive)
//   ordersMin/ordersMax   — order count range
//   revenueMin/revenueMax — Ordered Value range
//   invoiced              — 'yes' (has Lit Invoice orders) | 'no' (none)
//   invoicedMin/invoicedMax — Invoiced (sum of Lit Invoice amounts) range;
//                           a customer with no Lit Invoice orders counts as 0
//   avgMin/avgMax         — Avg Order Value range
//   lastOrderedSince      — ISO; last order on/after (client-computed from
//                           "days ago", in the viewer's local time)
//   lastOrderedBefore     — ISO; last order strictly before
const numParam = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dateParam = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const inRange = (v, min, max) => (min === null || v >= min) && (max === null || v <= max);

// Customers with at least one order matching the legacy order-level filters,
// or null when none of those filters is set. These answer "does this customer
// have a QUALIFYING order?" — they narrow which customers appear but never
// shrink a customer's totals to only those orders.
async function getOrderLevelQualifyingNames({ orderNumber, product, itemNo, status, dateFrom, dateTo }) {
  const m = {};
  if (orderNumber && String(orderNumber).trim()) {
    m.portal_order_ref = { $regex: escapeRegex(String(orderNumber).trim()), $options: 'i' };
  }
  if (product && String(product).trim()) {
    m['parsed_data.line_items'] = {
      $elemMatch: { description: { $regex: escapeRegex(String(product).trim()), $options: 'i' } },
    };
  }
  if (itemNo && String(itemNo).trim()) {
    m['resolution_data.results'] = { $elemMatch: { 'match.itemNo': String(itemNo).trim() } };
  }
  if (status && RESOLUTION_STATUSES.includes(status)) m.resolution_status = status;
  const dm = {};
  const from = dateParam(dateFrom);
  if (from) dm.$gte = from;
  const to = dateParam(dateTo);
  if (to) {
    to.setHours(23, 59, 59, 999);
    dm.$lte = to;
  }
  if (Object.keys(dm).length) m.upload_timestamp = dm;
  if (!Object.keys(m).length) return null;
  return new Set(await Order.distinct('customer_name', m));
}

const time = (d) => (d ? new Date(d).getTime() : 0);
const byNameBinary = (a, b) => (a.customerName < b.customerName ? -1 : a.customerName > b.customerName ? 1 : 0);
const textCompare = (x, y) => String(x).localeCompare(String(y), 'en', { sensitivity: 'base', numeric: true });

// Sortable columns. `value` reads the sort key; `empty` marks rows with no
// value (no postcode / no Lit Invoice orders) — those always sort LAST in
// either direction so a "—" pile never fills page 1. `dir` is the default
// direction when a column is first chosen (text A→Z, numbers/dates highest
// first) — and keeps the legacy one-word `sort` values behaving as before.
const SORT_COLUMNS = {
  name: { dir: 'asc', text: true, value: (c) => c.customerName },
  postcode: { dir: 'asc', text: true, value: (c) => c.postCode, empty: (c) => !c.postCode },
  orders: { dir: 'desc', value: (c) => c.orderCount },
  revenue: { dir: 'desc', value: (c) => c.totalRevenue },
  invoiced: { dir: 'desc', value: (c) => c.invoicedValue, empty: (c) => !c.invoicedOrderCount },
  avg: { dir: 'desc', value: (c) => c.avgOrderValue },
  recent: { dir: 'desc', value: (c) => time(c.lastOrderDate) },
  quantity: { dir: 'desc', value: (c) => c.totalQuantity },
};

function makeSorter(sort, dir) {
  const col = SORT_COLUMNS[sort] || SORT_COLUMNS.revenue;
  const d = dir === 'asc' || dir === 'desc' ? dir : col.dir;
  const sign = d === 'asc' ? 1 : -1;
  return (a, b) => {
    if (col.empty) {
      const ea = col.empty(a);
      const eb = col.empty(b);
      if (ea !== eb) return ea ? 1 : -1; // empties last, regardless of direction
    }
    const va = col.value(a);
    const vb = col.value(b);
    const cmp = col.text ? textCompare(va, vb) : va - vb;
    // Customer name (binary, A→Z) breaks ties so paging is deterministic.
    return sign * cmp || byNameBinary(a, b);
  };
}

export async function listCustomers({
  query,
  page,
  limit,
  sort,
  orderNumber,
  product,
  itemNo,
  revenueMin,
  revenueMax,
  dateFrom,
  dateTo,
  status,
  postCode,
  ordersMin,
  ordersMax,
  invoiced,
  invoicedMin,
  invoicedMax,
  avgMin,
  avgMax,
  lastOrderedSince,
  lastOrderedBefore,
  // all=true → every matching row in one response (Export), ignoring
  // page/limit. Filtering + sorting are identical to the paged list.
  all,
  // Sort direction 'asc' | 'desc'; omitted → the column's default.
  dir,
  // grouped=1 → group members returned in `groups` instead of the paged list.
  grouped,
} = {}) {
  const pageN = clampInt(page, 1, 1, 100000);
  const limitN = clampInt(limit, 25, 1, 100);

  const [summaries, qualifyingNames] = await Promise.all([
    getCustomerSummaries(),
    getOrderLevelQualifyingNames({ orderNumber, product, itemNo, status, dateFrom, dateTo }),
  ]);

  const q = query && String(query).trim().toLowerCase();
  const pc = postCode && String(postCode).replace(/\s+/g, '').toLowerCase();
  const revMin = numParam(revenueMin);
  const revMax = numParam(revenueMax);
  const ordMin = numParam(ordersMin);
  const ordMax = numParam(ordersMax);
  const avMin = numParam(avgMin);
  const avMax = numParam(avgMax);
  const invMin = numParam(invoicedMin);
  const invMax = numParam(invoicedMax);
  const invStatus = invoiced === 'yes' || invoiced === 'no' ? invoiced : null;
  const since = dateParam(lastOrderedSince);
  const before = dateParam(lastOrderedBefore);

  const filtered = summaries.filter((c) => {
    if (q && !c.customerName.toLowerCase().includes(q)) return false;
    if (qualifyingNames && !qualifyingNames.has(c.customerName)) return false;
    // "ub40" matches "UB4 0JN" / "UB40JN".
    if (pc && !c.postCode.replace(/\s+/g, '').toLowerCase().includes(pc)) return false;
    if (!inRange(c.orderCount, ordMin, ordMax)) return false;
    if (!inRange(c.totalRevenue, revMin, revMax)) return false;
    if (!inRange(c.avgOrderValue, avMin, avMax)) return false;
    const hasInvoiced = c.invoicedOrderCount > 0;
    if (invStatus === 'yes' && !hasInvoiced) return false;
    if (invStatus === 'no' && hasInvoiced) return false;
    if (!inRange(c.invoicedValue, invMin, invMax)) return false; // none = 0
    const last = time(c.lastOrderDate);
    if (since && last < since.getTime()) return false;
    if (before && last >= before.getTime()) return false;
    return true;
  });

  const sorted = [...filtered].sort(makeSorter(sort, dir));
  const exportAll = all === true || all === '1' || all === 'true';

  // Customer groups (Customers page only — `grouped=1`): each group becomes
  // ONE row in the same list, carrying the combined figures of its matching
  // members (same fields as a customer row), so it sorts and pages together
  // with every other customer. Its members ride along in `members` (same
  // filters + sort) for the expandable rows underneath. A group with no
  // matching member is left out. Without `grouped` (Reports, export, other
  // callers) the list is the full flat list exactly as before; every row
  // just also carries its `group` name.
  const groupedMode = !exportAll && (grouped === true || grouped === '1' || grouped === 'true');
  const sorter = makeSorter(sort, dir);
  let listRows = sorted;
  let customerTotal = sorted.length;
  if (groupedMode) {
    const byGroup = new Map(CUSTOMER_GROUPS.map((g) => [g.id, []]));
    const rows = [];
    for (const c of sorted) {
      const g = groupForCustomer(c.customerName);
      if (g) byGroup.get(g.id).push(c);
      else rows.push(c);
    }
    for (const g of CUSTOMER_GROUPS) {
      const members = byGroup.get(g.id);
      if (!members.length) continue;
      const orderCount = members.reduce((s, c) => s + c.orderCount, 0);
      const totalRevenue = members.reduce((s, c) => s + c.totalRevenue, 0);
      const pick = (field, better) => members.reduce((m, c) => (m === null || better(time(c[field]), time(m)) ? c[field] : m), null);
      rows.push({
        isGroup: true,
        groupId: g.id,
        customerName: g.name,
        postCode: '', // members have different postcodes
        orderCount,
        totalRevenue,
        avgOrderValue: orderCount ? round2(totalRevenue / orderCount) : 0,
        totalQuantity: members.reduce((s, c) => s + c.totalQuantity, 0),
        highestOrderValue: Math.max(...members.map((c) => c.highestOrderValue)),
        currency: members[0].currency,
        firstOrderDate: pick('firstOrderDate', (a, b) => a < b),
        lastOrderDate: pick('lastOrderDate', (a, b) => a > b),
        invoicedValue: round2(members.reduce((s, c) => s + c.invoicedValue, 0)),
        invoicedOrderCount: members.reduce((s, c) => s + c.invoicedOrderCount, 0),
        members, // already in the requested sort order
      });
    }
    listRows = rows.sort(sorter);
  }

  const total = listRows.length;
  const pageRows = exportAll ? listRows : listRows.slice((pageN - 1) * limitN, pageN * limitN);

  return {
    data: pageRows.map((c) => (c.isGroup ? toGroupRowDto(c) : toCustomerDto(c))),
    meta: exportAll
      ? { total, page: 1, limit: total, pages: 1 }
      : {
          total, // rows in the list (a group counts as one row)
          page: pageN,
          limit: limitN,
          pages: Math.max(1, Math.ceil(total / limitN)),
          // Grouped mode: individual customers matched (group members counted one by one).
          ...(groupedMode ? { customerTotal } : {}),
        },
  };
}

// A group row: the same shape as a customer row plus group fields.
function toGroupRowDto(g) {
  return {
    ...toCustomerDto(g),
    group: g.customerName,
    isGroup: true,
    groupId: g.groupId,
    memberCount: g.members.length,
    members: g.members.map(toCustomerDto),
  };
}

function toCustomerDto(c) {
  return {
    customerName: c.customerName,
    orderCount: c.orderCount,
    totalRevenue: round2(c.totalRevenue),
    avgOrderValue: c.avgOrderValue,
    totalQuantity: c.totalQuantity,
    highestOrderValue: round2(c.highestOrderValue),
    currency: c.currency,
    firstOrderDate: toIso(c.firstOrderDate),
    lastOrderDate: toIso(c.lastOrderDate),
    latestOrderRef: c.latestOrderRef,
    postCode: c.postCode,
    // Sum of Lit Invoice amounts across this customer's Lit-Invoice-ticked
    // orders; invoicedOrderCount 0 means none are marked (shown as "—").
    invoicedValue: c.invoicedValue,
    invoicedOrderCount: c.invoicedOrderCount,
    // Customer group name ('' when not in a group) — see config/customerGroups.js.
    group: groupForCustomer(c.customerName)?.name || '',
  };
}


// Full profile for one customer: financial summary, monthly revenue trend,
// most-purchased products, and full purchase history/timeline.
export async function getCustomerProfile(customerName) {
  const name = String(customerName || '').trim();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', 'Customer name is required.', { status: 400 });
  }

  const orders = await Order.find(
    { customer_name: name },
    {
      portal_order_ref: 1,
      processed_by: 1,
      order_date: 1,
      upload_timestamp: 1,
      total_products: 1,
      resolution_status: 1,
      'parsed_data.financials': 1,
      'parsed_data.line_items': 1,
      'parsed_data.delivery_address': 1,
      'parsed_data.billing_address': 1,
    }
  )
    .sort({ upload_timestamp: -1 })
    .lean();

  if (!orders.length) {
    throw new AppError('NOT_FOUND', `No customer found with name "${name}".`, { status: 404 });
  }

  const currency = orders[0]?.parsed_data?.financials?.currency || 'GBP';
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.parsed_data?.financials?.total) || 0), 0);
  const orderCount = orders.length;

  // Monthly revenue trend keyed on upload_timestamp — the one field every
  // order has as a real Date; order_date is free text copied from the email
  // (locale/format varies) and is not reliably parseable.
  const monthlyMap = new Map();
  for (const o of orders) {
    const d = o.upload_timestamp instanceof Date ? o.upload_timestamp : new Date(o.upload_timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = Number(o.parsed_data?.financials?.total) || 0;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + total);
  }
  const monthlyRevenue = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue: round2(revenue) }));

  // Yearly revenue — same shape as monthlyRevenue, one calendar year per row.
  const yearlyMap = new Map();
  for (const o of orders) {
    const d = o.upload_timestamp instanceof Date ? o.upload_timestamp : new Date(o.upload_timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const key = String(d.getFullYear());
    const total = Number(o.parsed_data?.financials?.total) || 0;
    yearlyMap.set(key, (yearlyMap.get(key) || 0) + total);
  }
  const yearlyRevenue = [...yearlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, revenue]) => ({ year, revenue: round2(revenue) }));

  // Month-over-month revenue growth — the last two months with any activity.
  // null when there's fewer than two months of history (nothing to compare).
  let revenueGrowthPct = null;
  if (monthlyRevenue.length >= 2) {
    const prev = monthlyRevenue[monthlyRevenue.length - 2].revenue;
    const curr = monthlyRevenue[monthlyRevenue.length - 1].revenue;
    revenueGrowthPct = prev !== 0 ? round2(((curr - prev) / Math.abs(prev)) * 100) : null;
  }
  const largestPurchaseMonth = monthlyRevenue.length
    ? monthlyRevenue.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    : null;

  // Highest / lowest individual order by total (zero-total orders excluded —
  // those are missing/unparsed financials, not genuinely £0 orders).
  const ordersWithTotal = orders
    .map((o) => ({
      portalOrderRef: o.portal_order_ref,
      total: Number(o.parsed_data?.financials?.total) || 0,
      uploadTimestamp: toIso(o.upload_timestamp),
    }))
    .filter((o) => o.total > 0);
  const highestOrder = ordersWithTotal.length
    ? ordersWithTotal.reduce((a, b) => (b.total > a.total ? b : a))
    : null;
  const lowestOrder = ordersWithTotal.length
    ? ordersWithTotal.reduce((a, b) => (b.total < a.total ? b : a))
    : null;

  // Most purchased products — grouped by the parsed line-item description.
  // Phase 1 uses the raw parsed name rather than resolving to a catalog item
  // number: resolution_data only covers products a user has approved/matched,
  // so grouping by it would silently under-count anything left unresolved.
  const productMap = new Map();
  for (const o of orders) {
    const ts = o.upload_timestamp instanceof Date ? o.upload_timestamp : new Date(o.upload_timestamp);
    for (const item of o.parsed_data?.line_items || []) {
      const key = item.description || 'Unknown';
      const entry = productMap.get(key) || {
        productName: key,
        totalQty: 0,
        totalSpent: 0,
        orderCount: 0,
        lastPurchaseDate: null,
      };
      entry.totalQty += Number(item.qty) || 0;
      entry.totalSpent += Number(item.total) || 0;
      entry.orderCount += 1;
      if (!entry.lastPurchaseDate || ts > entry.lastPurchaseDate) entry.lastPurchaseDate = ts;
      productMap.set(key, entry);
    }
  }
  // Total distinct products / total units purchased — over ALL products, not
  // just the top slice below.
  const totalProductsPurchased = productMap.size;
  const totalQuantityPurchased = [...productMap.values()].reduce((sum, p) => sum + p.totalQty, 0);

  // Widened to 20 (Phase 1 capped at 10): the Product Analytics view offers
  // multiple sort tabs (qty / revenue / recency / frequency) client-side over
  // one list, so it needs enough rows for each ordering to be meaningful.
  const topProducts = [...productMap.values()]
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, 20)
    .map((p) => ({
      ...p,
      totalSpent: round2(p.totalSpent),
      lastPurchaseDate: toIso(p.lastPurchaseDate),
      // Share of this customer's orders that included the product.
      frequencyPct: orderCount ? round2((p.orderCount / orderCount) * 100) : 0,
    }));

  const purchaseHistory = orders.map((o) => ({
    portalOrderRef: o.portal_order_ref,
    orderDate: o.order_date,
    uploadTimestamp: toIso(o.upload_timestamp),
    totalProducts: o.total_products,
    total: round2(Number(o.parsed_data?.financials?.total) || 0),
    currency: o.parsed_data?.financials?.currency || currency,
    resolutionStatus: o.resolution_status,
    processedBy: o.processed_by || '',
  }));

  return {
    customerName: name,
    currency,
    financials: {
      totalRevenue: round2(totalRevenue),
      orderCount,
      avgOrderValue: orderCount ? round2(totalRevenue / orderCount) : 0,
      firstOrderDate: toIso(orders[orders.length - 1].upload_timestamp),
      lastOrderDate: toIso(orders[0].upload_timestamp),
      // Phase 2 additions — all derived from the same order set above.
      totalProductsPurchased,
      totalQuantityPurchased,
      latestOrderStatus: orders[0].resolution_status,
      highestOrder,
      lowestOrder,
      largestPurchaseMonth,
      revenueGrowthPct,
    },
    monthlyRevenue,
    yearlyRevenue,
    topProducts,
    purchaseHistory,
    lastKnownAddress: orders[0]?.parsed_data?.delivery_address || orders[0]?.parsed_data?.billing_address || null,
  };
}
