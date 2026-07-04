// 404 handler for unmatched routes. Uses the standard error envelope.
export function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Not Found',
      details: [{ path: req.originalUrl }],
      requestId: req.id,
    },
  });
}
