import { randomUUID } from 'crypto';

// Attaches a correlation id to each request and echoes it as X-Request-Id.
export function requestId(req, res, next) {
  req.id = `req_${randomUUID().slice(0, 8)}`;
  res.setHeader('X-Request-Id', req.id);
  next();
}
