'use strict';

const logger = require('../logger');

/**
 * Central error handler — must have 4 parameters for Express to treat it as
 * an error-handling middleware.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  (req.log || logger).error(
    { err: err.message, stack: err.stack, status },
    'Unhandled error'
  );

  res.status(status).json({
    error: message,
    requestId: req.requestId,
  });
}

module.exports = { errorHandler };
