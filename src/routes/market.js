'use strict';

const { Router } = require('express');
const { getPrice, getKlines } = require('../lib/market');
const config = require('../config');

const router = Router();

/**
 * GET /api/market/price
 * Query params:
 *   symbol (optional) — defaults to BTCUSDT from config
 *
 * Returns current BTC spot price from Binance.
 */
router.get('/price', async (req, res, next) => {
  const symbol = (req.query.symbol || config.binance.symbol).toUpperCase();

  req.log.info({ symbol }, 'Price request received');

  try {
    const data = await getPrice(symbol);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/market/klines
 * Query params:
 *   symbol   (optional) — defaults to BTCUSDT
 *   interval (optional) — defaults to 1h
 *   limit    (optional) — defaults to 24, max 1000
 *
 * Returns OHLCV klines from Binance.
 */
router.get('/klines', async (req, res, next) => {
  const symbol   = (req.query.symbol   || config.binance.symbol).toUpperCase();
  const interval = req.query.interval  || '1h';
  const limit    = req.query.limit     || 24;

  req.log.info({ symbol, interval, limit }, 'Klines request received');

  try {
    const data = await getKlines({ symbol, interval, limit });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
