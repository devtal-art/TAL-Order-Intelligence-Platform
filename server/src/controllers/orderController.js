import * as orderService from '../services/orderService.js';
import { ensureDb } from '../utils/ensureDb.js';
import { AppError } from '../utils/AppError.js';

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// POST /api/v1/orders — create or update (upsert) one order by Portal Order Ref.
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
    });

    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders — list orders (summary), optional ?query= ref filter.
export async function listOrders(req, res, next) {
  try {
    ensureDb();
    const result = await orderService.listOrders({ query: req.query.query });
    res.status(200).json(result);
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
// Body: { comments: { [lineId]: 'Released' | 'OS' | 'N/A' | null } }
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
