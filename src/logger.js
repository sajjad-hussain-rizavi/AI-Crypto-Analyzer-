'use strict';

const pino = require('pino');
const config = require('./config');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(config.env !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    service: 'btc-ai-backend',
    env: config.env,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
