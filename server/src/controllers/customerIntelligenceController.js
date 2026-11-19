import * as customerService from '../services/customerIntelligenceService.js';
import { ensureDb } from '../utils/ensureDb.js';

// GET /api/v1/customers — list customers (derived from Orders), searchable,
// filterable, and paginated.
//   ?query=        substring on customer name
//   ?sort=         revenue|orders|recent|name|quantity|postcode|invoiced|avg
//   ?dir=          asc|desc (optional; default depends on the column)
//   ?orderNumber=  substring on portal_order_ref (Phase 2)
//   ?product=      substring on a purchased line-item description (Phase 2)
//   ?itemNo=       exact confirmed catalog item number (Phase 2)
//   ?revenueMin/revenueMax=  customer's aggregate revenue range (Phase 2)
//   ?dateFrom/dateTo=        order upload date range (Phase 2)
//   ?status=       resolution_status of at least one order (Phase 2)
//   Column filters (Customer List table):
//   ?postCode= ?ordersMin/ordersMax= ?invoiced=yes|no ?invoicedMin/invoicedMax=
//   ?avgMin/avgMax= ?lastOrderedSince/lastOrderedBefore= (ISO)
export async function listCustomers(req, res, next) {
  try {
    ensureDb();
    const {
      query, page, limit, sort,
      orderNumber, product, itemNo,
      revenueMin, revenueMax, dateFrom, dateTo, status,
      postCode, ordersMin, ordersMax, invoiced, invoicedMin, invoicedMax,
      avgMin, avgMax, lastOrderedSince, lastOrderedBefore, all, dir, grouped,
    } = req.query;
    const result = await customerService.listCustomers({
      query, page, limit, sort,
      orderNumber, product, itemNo,
      revenueMin, revenueMax, dateFrom, dateTo, status,
      postCode, ordersMin, ordersMax, invoiced, invoicedMin, invoicedMax,
      avgMin, avgMax, lastOrderedSince, lastOrderedBefore, all, dir, grouped,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customers/:name — full customer profile (financials, monthly
// revenue, top products, purchase history).
export async function getCustomerProfile(req, res, next) {
  try {
    ensureDb();
    const profile = await customerService.getCustomerProfile(req.params.name);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
}
