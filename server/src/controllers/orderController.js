import * as orderService from '../services/orderService.js';
import * as orderLogService from '../services/orderLogService.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';
import { buildDashboardWorkbook } from '../utils/dashboardWorkbook.js';

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// Order Activity Log — the client's stated reason for calling POST /orders on
// an already-existing ref (Add Product / Remove Product). Whitelisted so an
// arbitrary request body can never inject an unrecognized log action.
const SAVE_REASONS = ['product_added', 'product_removed'];

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
      reason,
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
      // Order Activity Log — who's calling, and (optionally) why on an
      // already-existing order. Never trust an unrecognized reason string.
      actor: req.user.name,
      actorRole: req.user.role,
      reason: SAVE_REASONS.includes(reason) ? reason : undefined,
    });

    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/manual/next-ref — preview of the ref the next manual
// order would get right now ('KS-YYYYMMDD-N'). Display only, while the
// Create Manual Order form is open; the real assignment happens at save
// time via POST /api/v1/orders/manual (see createManualOrder below).
export async function nextManualOrderRef(req, res, next) {
  try {
    ensureDb();
    const nextRef = await orderService.getNextManualOrderRef();
    res.status(200).json({ nextRef });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/orders/manual — create a new manual ("Orders - Kumkum")
// order. Unlike POST /api/v1/orders, the caller never supplies the ref —
// the server assigns 'KS-YYYYMMDD-N' itself (race-safe against concurrent
// saves), so there's nothing left to type or get wrong (V5).
export async function createManualOrder(req, res, next) {
  try {
    ensureDb();
    const { customerName, orderDate, totalProducts, parsedData, resolutionData, productNotes, orderComment } = req.body || {};

    const order = await orderService.createManualOrder({
      customerName: customerName || '',
      orderDate: orderDate || '',
      totalProducts: Number.isFinite(Number(totalProducts)) ? Number(totalProducts) : 0,
      parsedData: parsedData ?? {},
      resolutionData: resolutionData ?? {},
      productNotes: productNotes ?? {},
      orderComment: orderComment || '',
      // Automatically assigned from the JWT-authenticated user, same as
      // saveOrder above — never accepted from the request body.
      processedBy: req.user.name,
      actor: req.user.name,
      actorRole: req.user.role,
    });

    res.status(201).json(order);
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
    const order = await orderService.setProductComments(req.params.ref, comments, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
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
    const order = await orderService.setProductFulfillment(req.params.ref, fulfillment, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
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
    const order = await orderService.setProductNotes(req.params.ref, notes, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
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
    const order = await orderService.setOrderStatus(req.params.ref, {
      orderStatus,
      orderComment,
      actor: req.user.name,
      actorRole: req.user.role,
    });
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
    const order = await orderService.setDeliveryDate(req.params.ref, deliveryDate, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:ref/discount-provided — toggle whether the order's
// discount was actually provided/applied. Body: { discountProvided: boolean }
export async function setOrderDiscountProvided(req, res, next) {
  try {
    ensureDb();
    const { discountProvided } = req.body || {};
    if (typeof discountProvided !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'discountProvided must be a boolean.', {
        status: 400,
        details: [{ field: 'discountProvided', issue: 'required boolean' }],
      });
    }
    const order = await orderService.setDiscountProvided(req.params.ref, discountProvided, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
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
    const order = await orderService.setProcessedBy(req.params.ref, processedBy, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
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
    const order = await orderService.updateResolution(req.params.ref, resolutionData, {
      actor: req.user.name,
      actorRole: req.user.role,
    });
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/:ref/logs — one order's Activity Log, paginated, newest first.
export async function getOrderLogs(req, res, next) {
  try {
    ensureDb();
    const result = await orderLogService.getOrderLogs(req.params.ref, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/logs/recent — cross-order Recent Activity feed for the
// Dashboard. Registered before GET /:ref in the router (see order.routes.js).
export async function getRecentActivity(req, res, next) {
  try {
    ensureDb();
    const result = await orderLogService.getRecentLogs({
      page: req.query.page,
      limit: req.query.limit,
      date: req.query.date,
      portalOrderRef: req.query.portalOrderRef,
      actor: req.query.actor,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
