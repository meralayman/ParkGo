const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * For local dev, forward these paths to Express so relative URLs still work if env is missing.
 * Multipart POST /incidents must not be handled by the CRA dev server (it returns "Cannot POST /incidents").
 */
module.exports = function setupProxy(app) {
  const target = 'http://127.0.0.1:5000';
  const opts = { target, changeOrigin: true };
  /** Ensures /api/* (e.g. /api/forecast) hits Express; package.json "proxy" alone can miss some paths. */
  app.use('/api', createProxyMiddleware(opts));
  app.use('/incidents', createProxyMiddleware(opts));
  app.use('/uploads', createProxyMiddleware(opts));
};
