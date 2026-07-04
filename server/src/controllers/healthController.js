// Health check — infrastructure only, no business logic.
export function health(req, res) {
  res.json({
    status: 'ok',
    service: 'order-intelligence-server',
    timestamp: new Date().toISOString(),
  });
}
