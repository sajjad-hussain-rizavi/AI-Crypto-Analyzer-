#!/usr/bin/env node
'use strict';

/**
 * cli.js — Pretty-print all BTC AI Backend endpoints in the terminal.
 * Usage:
 *   node cli.js                          # runs all endpoints
 *   node cli.js health                   # just health
 *   node cli.js price                    # just price
 *   node cli.js klines                   # just klines
 *   node cli.js ask "Your question here" # just ask
 */

const http = require('http');

const BASE = `http://localhost:${process.env.PORT || 3002}`;

// ─────────────────────────────────────────────────────────────────
// ANSI colours
// ─────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  white:  '\x1b[37m',
  bgBlue: '\x1b[44m',
};

const bold   = s => `${C.bold}${s}${C.reset}`;
const green  = s => `${C.green}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;

// ─────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    };

    const url = new URL(BASE + path);
    options.hostname = url.hostname;
    options.port     = url.port;
    options.path     = url.pathname;

    const req = http.request(options, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────
// ASCII table builder
// ─────────────────────────────────────────────────────────────────
function buildTable(headers, rows, { title, colAligns } = {}) {
  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
  );

  const totalWidth = widths.reduce((a, w) => a + w + 3, 1);

  const hr     = `+${widths.map(w => '-'.repeat(w + 2)).join('+')}+`;
  const thickHr = `+${widths.map(w => '='.repeat(w + 2)).join('+')}+`;

  const lines = [];

  if (title) {
    const inner = totalWidth - 2;
    const padded = title.padStart(Math.floor((inner + title.length) / 2)).padEnd(inner);
    lines.push(`+${'-'.repeat(inner)}+`);
    lines.push(`|${bold(cyan(padded))}|`);
  }

  lines.push(thickHr);

  // Header row
  const headerRow = headers.map((h, i) => {
    const cell = bold(h.padEnd(widths[i]));
    return ` ${cell} `;
  }).join('|');
  lines.push(`|${headerRow}|`);
  lines.push(thickHr);

  // Data rows
  rows.forEach((row, ri) => {
    const cells = row.map((cell, i) => {
      const str   = String(cell ?? '');
      const align = colAligns?.[i] === 'right';
      const padded = align ? str.padStart(widths[i]) : str.padEnd(widths[i]);
      return ` ${padded} `;
    });
    lines.push(`|${cells.join('|')}|`);
    if (ri < rows.length - 1) lines.push(hr);
  });

  lines.push(thickHr);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────
function sectionHeader(title, emoji = '📊') {
  const line = '─'.repeat(60);
  console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${emoji}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${line}${C.reset}`);
}

// ─────────────────────────────────────────────────────────────────
// Endpoint formatters
// ─────────────────────────────────────────────────────────────────
async function showHealth() {
  sectionHeader('Health Check', '🩺');
  const { data } = await request('GET', '/api/health');
  // Health stays as raw JSON per user request
  console.log(JSON.stringify(data, null, 2));
}

async function showPrice() {
  sectionHeader('Current BTC Price', '💰');
  const { data } = await request('GET', '/api/market/price');

  const table = buildTable(
    ['Field', 'Value'],
    [
      ['Symbol',      yellow(data.symbol)],
      ['Price (USD)', green(`$${Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)],
      ['Fetched At',  dim(data.fetchedAt)],
    ],
    { title: ' BTCUSDT SPOT PRICE ' }
  );

  console.log('\n' + table);
}

async function showKlines() {
  sectionHeader('24h Klines (1h intervals)', '📈');
  const { data } = await request('GET', '/api/market/klines?interval=1h&limit=24');

  const fmt   = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtVol = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  // Summary stats
  const closes  = data.klines.map(k => parseFloat(k.close));
  const highs   = data.klines.map(k => parseFloat(k.high));
  const lows    = data.klines.map(k => parseFloat(k.low));
  const first   = parseFloat(data.klines[0].open);
  const last    = closes[closes.length - 1];
  const change  = last - first;
  const changePct = ((change / first) * 100).toFixed(2);
  const trend   = change >= 0 ? green(`▲ +$${fmt(change)} (+${changePct}%)`) : red(`▼ -$${fmt(Math.abs(change))} (${changePct}%)`);

  // Summary table
  const summary = buildTable(
    ['Metric', 'Value'],
    [
      ['Symbol',        data.symbol],
      ['Interval',      data.interval],
      ['Candles',       String(data.klines.length)],
      ['Period Open',   `$${fmt(first)}`],
      ['Period Close',  `$${fmt(last)}`],
      ['24h High',      green(`$${fmt(Math.max(...highs))}`)],
      ['24h Low',       red(`$${fmt(Math.min(...lows))}`)],
      ['24h Change',    trend],
      ['Fetched At',    dim(data.fetchedAt)],
    ],
    { title: ' 24H SUMMARY ' }
  );
  console.log('\n' + summary);

  // Full klines table
  const rows = data.klines.map(k => {
    const o = parseFloat(k.open);
    const c = parseFloat(k.close);
    const dir = c >= o ? green('▲') : red('▼');
    const time = k.openTime.replace('T', ' ').replace('.000Z', '');
    return [
      time,
      dir,
      `$${fmt(k.open)}`,
      `$${fmt(k.high)}`,
      `$${fmt(k.low)}`,
      `$${fmt(k.close)}`,
      fmtVol(k.volume),
      k.trades.toLocaleString(),
    ];
  });

  const klineTable = buildTable(
    ['Open Time (UTC)', ' ', 'Open', 'High', 'Low', 'Close', 'Volume (BTC)', 'Trades'],
    rows,
    {
      title: ' OHLCV KLINES ',
      colAligns: [null, null, 'right', 'right', 'right', 'right', 'right', 'right'],
    }
  );
  console.log('\n' + klineTable);
}

async function showAsk(question) {
  const q = question || 'Is Bitcoin showing bullish or bearish signals based on recent price action?';
  sectionHeader('AI Market Analysis', '🤖');
  console.log(dim(`  Question: ${q}\n  Waiting for Ollama...`));

  const { data } = await request('POST', '/api/ask', { question: q });

  if (data.error) {
    console.log(red(`\n  Error: ${data.error}`));
    return;
  }

  // Market context table
  if (data.marketContext) {
    const mc = data.marketContext;
    const ctxTable = buildTable(
      ['Field', 'Value'],
      [
        ['Symbol',       yellow(mc.symbol)],
        ['Price (USD)',  green(`$${Number(mc.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)],
        ['Klines Used',  String(mc.klinesCount)],
        ['Data As Of',   dim(mc.fetchedAt)],
      ],
      { title: ' MARKET CONTEXT ' }
    );
    console.log('\n' + ctxTable);
  }

  // Answer box
  const width  = 68;
  const words  = data.answer.split(' ');
  const answerLines = [];
  let   line   = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      answerLines.push(line.trim());
      line = word;
    } else {
      line += (line ? ' ' : '') + word;
    }
  }
  if (line) answerLines.push(line.trim());

  const border = `+${'─'.repeat(width + 2)}+`;
  console.log(`\n${bold(cyan('  Answer'))}`);
  console.log(border);
  answerLines.forEach(l => console.log(`| ${l.padEnd(width)} |`));
  console.log(border);

  // Metadata
  const metaTable = buildTable(
    ['Field', 'Value'],
    [
      ['Model',       data.model],
      ['Duration',    `${(data.durationMs / 1000).toFixed(1)}s`],
      ['Request ID',  dim(data.requestId)],
    ],
    { title: ' RESPONSE METADATA ' }
  );
  console.log('\n' + metaTable);
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
async function main() {
  const [,, cmd, ...args] = process.argv;

  const banner = `${C.bold}${C.bgBlue}${C.white}  ₿  BTC AI BACKEND — Terminal View  ${C.reset}`;
  console.log('\n' + banner);
  console.log(dim(`  Server: ${BASE}  •  ${new Date().toUTCString()}`));

  try {
    switch (cmd) {
      case 'health': await showHealth();              break;
      case 'price':  await showPrice();               break;
      case 'klines': await showKlines();              break;
      case 'ask':    await showAsk(args.join(' '));   break;
      default:
        // No argument — run everything
        await showHealth();
        await showPrice();
        await showKlines();
        await showAsk(args.join(' ') || undefined);
        break;
    }
  } catch (err) {
    console.error(red(`\n  ✗ Could not connect to server at ${BASE}`));
    console.error(dim(`    Is 'npm start' running? (${err.message})`));
    process.exit(1);
  }

  console.log('\n');
}

main();
