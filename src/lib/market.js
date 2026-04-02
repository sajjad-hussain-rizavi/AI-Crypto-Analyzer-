'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../logger');

/** Reusable axios instance scoped to Binance */
const client = axios.create({
  baseURL: config.binance.baseUrl,
  timeout: config.binance.timeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Fetch the current spot price for a symbol.
 * @param {string} [symbol] - e.g. "BTCUSDT"
 * @returns {Promise<{ symbol: string, price: string, fetchedAt: string }>}
 */
async function getPrice(symbol = config.binance.symbol) {
  const log = logger.child({ fn: 'getPrice', symbol });
  const t0 = Date.now();

  try {
    const { data } = await client.get('/api/v3/ticker/price', {
      params: { symbol },
    });

    const duration = Date.now() - t0;
    log.info({ duration, price: data.price }, 'Binance price fetched');

    return {
      symbol: data.symbol,
      price: data.price,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const duration = Date.now() - t0;
    log.error(
      { duration, err: err.message, status: err.response?.status },
      'Failed to fetch Binance price'
    );
    throw normaliseError(err, 'Could not retrieve current BTC price');
  }
}

/**
 * Fetch OHLCV klines for a symbol.
 * @param {Object} opts
 * @param {string}  [opts.symbol]   - e.g. "BTCUSDT"
 * @param {string}  [opts.interval] - e.g. "1h"
 * @param {number}  [opts.limit]    - max 1000, default 24
 * @returns {Promise<{ symbol, interval, limit, klines: Array, fetchedAt: string }>}
 */
async function getKlines({ symbol = config.binance.symbol, interval = '1h', limit = 24 } = {}) {
  const log = logger.child({ fn: 'getKlines', symbol, interval, limit });
  const t0 = Date.now();

  // Binance caps limit at 1000
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 24), 1000);

  const VALID_INTERVALS = new Set([
    '1s','1m','3m','5m','15m','30m',
    '1h','2h','4h','6h','8h','12h',
    '1d','3d','1w','1M',
  ]);
  if (!VALID_INTERVALS.has(interval)) {
    throw Object.assign(new Error(`Invalid interval: ${interval}`), { status: 400 });
  }

  try {
    const { data } = await client.get('/api/v3/klines', {
      params: { symbol, interval, limit: safeLimit },
    });

    const duration = Date.now() - t0;
    log.info({ duration, count: data.length }, 'Binance klines fetched');

    return {
      symbol,
      interval,
      limit: safeLimit,
      klines: data.map(formatKline),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err.status === 400) throw err; // re-throw our validation errors
    const duration = Date.now() - t0;
    log.error(
      { duration, err: err.message, status: err.response?.status },
      'Failed to fetch Binance klines'
    );
    throw normaliseError(err, 'Could not retrieve BTC klines');
  }
}

/**
 * Convert raw Binance kline array to a named-field object.
 * Binance returns: [openTime, open, high, low, close, volume, closeTime, ...]
 */
function formatKline(k) {
  return {
    openTime:   new Date(k[0]).toISOString(),
    open:       k[1],
    high:       k[2],
    low:        k[3],
    close:      k[4],
    volume:     k[5],
    closeTime:  new Date(k[6]).toISOString(),
    trades:     k[8],
  };
}

/**
 * Wrap axios errors in a consistent shape with an HTTP status hint.
 */
function normaliseError(err, fallbackMessage) {
  const binanceMsg = err.response?.data?.msg || '';
  const status     = err.response?.status || 502;

  // Binance returns code -1121 for unknown trading pairs
  const isInvalidSymbol =
    err.response?.data?.code === -1121 ||
    binanceMsg.toLowerCase().includes('invalid symbol');

  const message = isInvalidSymbol
    ? 'Invalid symbol — verify the pair exists on Binance (e.g. ETHUSDT, SOLUSDT, BNBUSDT)'
    : binanceMsg || err.message || fallbackMessage;

  return Object.assign(new Error(message), { status: isInvalidSymbol ? 400 : status });
}

module.exports = { getPrice, getKlines };
