'use strict';

require('dotenv').config();

const express = require('express');
const config  = require('./config');
const logger  = require('./logger');

const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler  } = require('./middleware/errorHandler');

const healthRouter = require('./routes/health');
const marketRouter = require('./routes/market');
const askRouter    = require('./routes/ask');

// ─────────────────────────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────────────────────────
const app = express();

// Trust proxy headers (needed when behind nginx)
app.set('trust proxy', 1);

// Parse JSON bodies
app.use(express.json());

// Attach requestId + per-request child logger + finish-time logging
app.use(requestLogger);

// ─────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/market', marketRouter);
app.use('/api/ask',    askRouter);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    requestId: req.requestId,
  });
});

// Central error handler (must be last)
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.env,
      ollamaUrl: config.ollama.baseUrl,
      ollamaModel: config.ollama.model,
      binanceUrl: config.binance.baseUrl,
    },
    `BTC AI Backend listening on port ${config.port}`
  );
});

// Graceful shutdown
function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received — closing server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit if connections don't drain in time
  setTimeout(() => {
    logger.warn('Forcing process exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app; // exported for testing
