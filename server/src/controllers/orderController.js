import * as orderService from '../services/orderService.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';
import { buildDashboardWorkbook } from '../utils/dashboardWorkbook.js';

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// POST /api/v1/orders — create or update (upsert) one order by Portal Order Ref.
// The `processedBy` field is set automatically from the authenticated user
// (req.user.name, injected by the authenticate middleware). It is NEVER
// accepted from the request body — this ensures the processor is always the
// person who actually uploaded and saved the order.
export async function saveOrder(req, res, next) {
  try {
    ensureDb();
    const {
      portalOrderRef,
      filename,
      customerName,
      orderDate,
      totalProducts,
      parsedData,
      resolutionData,
      orderSource,
    } = req.body || {};

    if (isBlank(portalOrderRef)) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'portalOrderRef', issue: 'required' }],
      });
    }

    const order = await orderService.upsertOrder({
      portalOrderRef: String(portalOrderRef).trim(),
      filename: filename || '',
      customerName: customerName || '',
      orderDate: orderDate || '',
      totalProducts: Number.isFinite(Number(totalProducts)) ? Number(totalProducts) : 0,
      parsedData: parsedData ?? {},
      resolutionData: resolutionData ?? {},
      // Automatically assigned from the JWT-authenticated user.
      // req.user is guaranteed non-null here (authenticate middleware ran first).
      processedBy: req.user.name,
      // Optional (V3.1 — Manual Order Creation). Omitted by the HTML upload
      // flow, so those orders keep the schema default ('HTML').
      orderSource: orderSource === 'MANUAL' ? 'MANUAL' : undefined,
    });

    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}


// GET /api/v1/orders — list orders (summary), optional ?query= ref filter,
// ?company= exact company filter, and ?limit= result cap.
export async function listOrders(req, res, next) {
  try {
    ensureDb();
    const result = await orderService.listOrders({ query: req.query.query, company: req.query.company, limit: req.query.limit });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/companies/autocomplete — search companies by name.
export async function autocompleteCompanies(req, res, next) {
  try {
    ensureDb();
    const result = await orderService.autocompleteCompanies(req.query.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/dashboard — dashboard summary (V2.2, read-only).
// ?limit= caps the preview cards per bucket (default 5, max 20). Derived live
// from the Orders collection — no dashboard collections, nothing duplicated.
export async function getDashboard(req, res, next) {
  try {
    ensureDb();
    const summary = await orderService.getDashboardSummary({ previewLimit: req.query.limit });
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/dashboard/orders — full filtered bucket list ("View All").
// ?type=status|comment &value=<bucket> &page= &limit= (V2.2, read-only).
export async function listDashboardOrders(req, res, next) {
  try {
    ensureDb();
    const { type, value, page, limit, sortBy, sortDir } = req.query;
    const result = await orderService.listDashboardOrders({ type, value, page, limit, sortBy, sortDir });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/dashboard/export — full dashboard workbook download
// (V4.8, read-only). Multi-sheet .xlsx: Summary, All Orders, per-channel
// order lists, All Items, Unique Items, Order Status, Item Status, Discount,
// Team Performance. Streamed directly to the response, nothing buffered
// beyond what ExcelJS needs to write it.
export async function exportDashboard(req, res, next) {
  try {
    ensureDb();
    const orders = await orderService.getDashboardExportOrders();
    const workbook = buildDashboardWorkbook(orders);
    const filename = `Dashboard Export ${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/:ref — full order detail.
export async function getOrder(req, res, next) {
  try {
    ensureDb();
    const order = await orderService.getOrder(req.params.ref);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/comments — set/clear per-product comments.
// Body: { comments: { [lineId]: 'Released' | 'OS' | 'N/A' | 'Not Found' | null } }
export async function setOrderComments(req, res, next) {
  try {
    ensureDb();
    const { comments } = req.body || {};
    if (!comments || typeof comments !== 'object' || Array.isArray(comments)) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'comments', issue: 'required object of { lineId: comment }' }],
      });
    }
    const order = await orderService.setProductComments(req.params.ref, comments);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/fulfillment — set/clear per-product delivery tracking.
// Body: { fulfillment: { [lineId]: { pendingQty?, status? } | null } }
export async function setOrderFulfillment(req, res, next) {
  try {
    ensureDb();
    const { fulfillment } = req.body || {};
    if (!fulfillment || typeof fulfillment !== 'object' || Array.isArray(fulfillment)) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'fulfillment', issue: 'required object of { lineId: { pendingQty, status } }' }],
      });
    }
    const order = await orderService.setProductFulfillment(req.params.ref, fulfillment);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/notes — set/clear per-product Additional Comments.
// Body: { notes: { [lineId]: string | null } } (V1.7 — additive)
export async function setOrderNotes(req, res, next) {
  try {
    ensureDb();
    const { notes } = req.body || {};
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'notes', issue: 'required object of { lineId: note }' }],
      });
    }
    const order = await orderService.setProductNotes(req.params.ref, notes);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/status — set the overall Order Status + Order
// Comment (V3.2). Distinct from /comments (per-product Reason) and /notes
// (per-product Comments) — this is order-level, not lineId-keyed.
// Body: { orderStatus: one of orderService.ORDER_STATUSES, orderComment?: string }
export async function setOrderStatus(req, res, next) {
  try {
    ensureDb();
    const { orderStatus, orderComment } = req.body || {};
    const order = await orderService.setOrderStatus(req.params.ref, { orderStatus, orderComment });
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/delivery-date — set/clear the order's delivery
// date (V4.2). Independent of Order Status/Comment — a plain, always-
// editable free-text field, never required.
// Body: { deliveryDate: string }
export async function setOrderDeliveryDate(req, res, next) {
  try {
    ensureDb();
    const { deliveryDate } = req.body || {};
    if (deliveryDate === undefined) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'deliveryDate', issue: 'required (empty string clears it)' }],
      });
    }
    const order = await orderService.setDeliveryDate(req.params.ref, deliveryDate);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/processed-by — assign/clear the order's processor.
// Body: { processedBy: <one of orderService.PROCESSED_BY_USERS> | '' | null } (V1.9)
export async function setOrderProcessedBy(req, res, next) {
  try {
    ensureDb();
    const { processedBy } = req.body || {};
    if (processedBy === undefined) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'processedBy', issue: 'required (empty string clears the assignment)' }],
      });
    }
    const order = await orderService.setProcessedBy(req.params.ref, processedBy);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref — update resolution snapshot + derived status.
export async function updateOrder(req, res, next) {
  try {
    ensureDb();
    const { resolutionData } = req.body || {};
    if (resolutionData === undefined) {
      throw new AppError('VALIDATION_ERROR', 'Missing required field.', {
        status: 400,
        details: [{ field: 'resolutionData', issue: 'required' }],
      });
    }
    const order = await orderService.updateResolution(req.params.ref, resolutionData);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}
