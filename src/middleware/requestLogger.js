'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

/**
 * Attaches a unique requestId to every request and response,
 * then logs method, path, status, and duration when the response finishes.
 */
function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Attach a child logger to the request so route handlers can use it
  req.log = logger.child({ requestId });

  const t0 = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - t0;
    req.log.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
      'Request completed'
    );
  });

  next();
}

module.exports = { requestLogger };
