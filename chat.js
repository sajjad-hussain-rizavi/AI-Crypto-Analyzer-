#!/usr/bin/env node
'use strict';

/**
 * chat.js — Interactive terminal chat with the BTC AI backend.
 * Maintains full conversation history so the model remembers prior turns.
 *
 * Usage:
 *   node chat.js
 *   node chat.js --no-market       # skip live market data injection
 *   node chat.js --symbol ETHUSDT  # different trading pair
 */

const readline = require('readline');
const http     = require('http');

// ─────────────────────────────────────────────────────────────────
// Config from args / env
// ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const BASE    = `http://localhost:${process.env.PORT || 3002}`;
const NO_MKT  = args.includes('--no-market');
const symIdx  = args.indexOf('--symbol');
const SYMBOL  = symIdx !== -1 ? args[symIdx + 1] : 'BTCUSDT';

// ─────────────────────────────────────────────────────────────────
// ANSI helpers
// ─────────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  red:     '\x1b[31m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
  bgGreen: '\x1b[42m',
};

const bold    = s => `${C.bold}${s}${C.reset}`;
const dim     = s => `${C.dim}${s}${C.reset}`;
const cyan    = s => `${C.cyan}${s}${C.reset}`;
const yellow  = s => `${C.yellow}${s}${C.reset}`;
const green   = s => `${C.green}${s}${C.reset}`;
const red     = s => `${C.red}${s}${C.reset}`;
const magenta = s => `${C.magenta}${s}${C.reset}`;

// ─────────────────────────────────────────────────────────────────
// HTTP helper (no external deps — uses built-in http)
// ─────────────────────────────────────────────────────────────────
function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url     = new URL(BASE + path);

    const req = http.request({
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Bad JSON: ${raw}`)); }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Bad JSON: ${raw}`)); }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────
// Text wrapping for the terminal
// ─────────────────────────────────────────────────────────────────
function wrap(text, width = 72, indent = '  ') {
  const words  = text.split(' ');
  const lines  = [];
  let   line   = '';

  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(indent + line.trim());
      line = word;
    } else {
      line += (line ? ' ' : '') + word;
    }
  }
  if (line) lines.push(indent + line.trim());
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────
function printBanner() {
  console.clear();
  console.log(`\n${C.bold}${C.bgBlue}${C.white}  ₿  CRYPTO AI CHAT  ${C.reset}  ${dim('type /help for commands')}`);
  console.log(dim(`  Server : ${BASE}   Symbol : ${SYMBOL}   Market data : ${NO_MKT ? 'off' : 'on'}`));
  console.log(dim('  ─────────────────────────────────────────────────────────'));
  console.log();
}

function printHelp() {
  console.log(`
${bold('Commands:')}
  ${cyan('/price [SYMBOL]')}          Show price   e.g. /price ETHUSDT
  ${cyan('/klines [SYMBOL] [iv]')}    24h candles  e.g. /klines SOLUSDT 15m
  ${cyan('/clear')}                   Clear conversation history
  ${cyan('/history')}                 Show conversation so far
  ${cyan('/market on|off')}           Toggle live market data in prompts
  ${cyan('/help')}                    Show this message
  ${cyan('/exit')}  or  Ctrl+C        Quit

${bold('Symbol examples:')}
  BTCUSDT  ETHUSDT  SOLUSDT  BNBUSDT  ADAUSDT  DOGEUSDT
  XRPUSDT  AVAXUSDT DOTUSDT  MATICUSDT LINKUSDT LTCUSDT

${bold('Tips:')}
  • The AI remembers everything said this session
  • Market data is injected into every prompt automatically
  • Omitting [SYMBOL] uses the default (${SYMBOL})
  • Ask follow-ups freely — "why?", "elaborate", "compare to ETH"
`);
}

function printPrice(data) {
  const price = Number(data.price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  console.log(`\n  ${yellow('●')} ${bold(data.symbol)}  ${green(`$${price}`)}  ${dim(data.fetchedAt)}\n`);
}

function printKlinesSummary(data) {
  const closes = data.klines.map(k => parseFloat(k.close));
  const highs  = data.klines.map(k => parseFloat(k.high));
  const lows   = data.klines.map(k => parseFloat(k.low));
  const open   = parseFloat(data.klines[0].open);
  const close  = closes[closes.length - 1];
  const chg    = close - open;
  const pct    = ((chg / open) * 100).toFixed(2);
  const fmt    = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

  const arrow  = chg >= 0 ? green(`▲ +$${fmt(chg)} (+${pct}%)`) : red(`▼ -$${fmt(Math.abs(chg))} (${pct}%)`);

  console.log(`
  ${bold('24h Klines Summary')} ${dim(`(${data.interval} • ${data.klines.length} candles)`)}
  ┌──────────────────────────────┐
  │  Open   ${`$${fmt(open)}`.padStart(20)}  │
  │  Close  ${`$${fmt(close)}`.padStart(20)}  │
  │  High   ${green(`$${fmt(Math.max(...highs))}`).padStart(29)}  │
  │  Low    ${red(`$${fmt(Math.min(...lows))}`).padStart(29)}  │
  │  Change ${arrow.padStart(38)}  │
  └──────────────────────────────┘
`);
}

function printThinking() {
  process.stdout.write(`\n  ${magenta('◉')} ${dim('Thinking')} `);
  let i = 0;
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  return setInterval(() => {
    process.stdout.write(`\r  ${magenta('◉')} ${dim('Thinking')} ${dim(frames[i++ % frames.length])}`);
  }, 80);
}

function printAnswer(answer, meta) {
  const line = '─'.repeat(70);
  console.log(`\r  ${magenta('◉')} ${bold(magenta('Assistant'))}  ${dim(`${(meta.durationMs/1000).toFixed(1)}s • ${meta.model}`)}`);
  console.log(`  ${dim(line)}`);
  console.log(wrap(answer, 70));
  console.log(`  ${dim(line)}\n`);
}

function printMarketBadge(ctx) {
  if (!ctx) return;
  const price = Number(ctx.price).toLocaleString('en-US', { minimumFractionDigits: 2 });
  process.stdout.write(dim(`  [market: $${price} • ${ctx.klinesCount} candles] `));
}

// ─────────────────────────────────────────────────────────────────
// Conversation state
// ─────────────────────────────────────────────────────────────────
let history       = [];   // [{role, content}]
let marketEnabled = !NO_MKT;

// ─────────────────────────────────────────────────────────────────
// Main chat loop
// ─────────────────────────────────────────────────────────────────
async function main() {
  // Verify server is up
  try {
    const health = await get('/api/health');
    if (!health.ok) throw new Error('Server not healthy');
    if (health.ollama === 'unreachable') {
      console.error(red('\n  ✗ Ollama is unreachable. Run: ollama serve\n'));
      process.exit(1);
    }
  } catch (err) {
    console.error(red(`\n  ✗ Cannot reach server at ${BASE}`));
    console.error(dim(`    Is 'npm start' running? (${err.message})\n`));
    process.exit(1);
  }

  printBanner();

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: `${C.cyan}${C.bold}  You › ${C.reset}`,
  });

  rl.prompt();

  rl.on('line', async rawLine => {
    const line = rawLine.trim();
    if (!line) { rl.prompt(); return; }

    // ── Built-in commands ────────────────────────────────────────
    if (line.startsWith('/')) {
      const [cmd, ...cmdArgs] = line.slice(1).split(' ');

      switch (cmd.toLowerCase()) {
        case 'exit':
        case 'quit':
          console.log(dim('\n  Goodbye.\n'));
          process.exit(0);
          break;

        case 'help':
          printHelp();
          break;

        case 'clear':
          history = [];
          console.log(dim('\n  ✓ Conversation history cleared.\n'));
          break;

        case 'history':
          if (history.length === 0) {
            console.log(dim('\n  (No history yet)\n'));
          } else {
            console.log();
            history.forEach(t => {
              const label = t.role === 'user'
                ? `  ${cyan('You')}      `
                : `  ${magenta('Assistant')}`;
              console.log(`${label}  ${dim('│')}  ${wrap(t.content, 60, '             ').trimStart()}`);
            });
            console.log();
          }
          break;

        case 'price': {
          const sym = (cmdArgs[0] || SYMBOL).toUpperCase();
          try {
            const d = await get(`/api/market/price?symbol=${sym}`);
            printPrice(d);
          } catch (e) {
            const hint = sym !== 'BTCUSDT' ? ` — is "${sym}" a valid Binance pair?` : '';
            console.log(red(`\n  ✗ Could not fetch price for ${sym}${hint}\n`));
          }
          break;
        }

        case 'klines': {
          const sym = (cmdArgs[0] || SYMBOL).toUpperCase();
          const iv  = cmdArgs[1] || '1h';
          try {
            const d = await get(`/api/market/klines?symbol=${sym}&interval=${iv}&limit=24`);
            printKlinesSummary(d);
          } catch (e) {
            const hint = sym !== 'BTCUSDT' ? ` — is "${sym}" a valid Binance pair?` : '';
            console.log(red(`\n  ✗ Could not fetch klines for ${sym}${hint}\n`));
          }
          break;
        }

        case 'market':
          if (cmdArgs[0] === 'off') {
            marketEnabled = false;
            console.log(dim('\n  Market data injection: off\n'));
          } else {
            marketEnabled = true;
            console.log(dim('\n  Market data injection: on\n'));
          }
          break;

        default:
          console.log(red(`\n  Unknown command: /${cmd}  (type /help)\n`));
      }

      rl.prompt();
      return;
    }

    // ── Send to AI ───────────────────────────────────────────────
    const spinner = printThinking();

    try {
      const resp = await post('/api/ask', {
        question: line,
        history,
        symbol: SYMBOL,
        includeMarketContext: marketEnabled,
      });

      clearInterval(spinner);

      if (resp.error) {
        console.log(`\r  ${red('✗')} ${red(resp.error)}\n`);
      } else {
        printMarketBadge(resp.marketContext);
        console.log();
        printAnswer(resp.answer, { durationMs: resp.durationMs, model: resp.model });

        // Append this turn to history
        history.push({ role: 'user',      content: line         });
        history.push({ role: 'assistant', content: resp.answer  });

        // Keep history bounded to last 20 turns (10 exchanges)
        if (history.length > 20) history = history.slice(-20);
      }
    } catch (err) {
      clearInterval(spinner);
      console.log(`\r  ${red('✗')} ${red(err.message)}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(dim('\n  Goodbye.\n'));
    process.exit(0);
  });
}

main();
