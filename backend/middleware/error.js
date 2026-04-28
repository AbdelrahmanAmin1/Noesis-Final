'use strict';

const log = require('../utils/logger');

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: 'not_found', path: req.path });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large' });
  }
  if (err && err.code && String(err.code).startsWith('LIMIT_')) {
    return res.status(413).json({ error: 'multipart_too_large', code: err.code });
  }
  if (err && err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.code || err.message || 'bad_request' });
  }
  log.error('unhandled', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'internal_error' });
}

module.exports = { HttpError, notFound, errorHandler };
