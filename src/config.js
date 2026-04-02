'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3002,

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
    /** ms before we give up waiting for a generation */
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 60_000,
  },

  binance: {
    baseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
    symbol: process.env.BTC_SYMBOL || 'BTCUSDT',
    /** ms before we give up on a market request */
    timeoutMs: parseInt(process.env.BINANCE_TIMEOUT_MS, 10) || 10_000,
  },

  /** 'development' | 'production' | 'test' */
  env: process.env.NODE_ENV || 'development',
};

module.exports = config;
