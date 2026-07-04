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
