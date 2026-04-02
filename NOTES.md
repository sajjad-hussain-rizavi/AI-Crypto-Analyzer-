# NOTES.md — BTC AI Backend Assessment

## Market Data Source

**Choice: Binance Public REST API** — no API keys needed for public endpoints.

| Endpoint | URL |
|---|---|
| Spot price | `GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT` |
| Klines/OHLCV | `GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24` |

Binance was chosen because it has:
- No authentication requirement for public market data
- High liquidity (BTC/USDT is the world's most-traded crypto pair), making prices representative
- A well-documented, stable REST API with sensible error codes
- Generous rate limits for unauthenticated requests (~1200 requests/minute per IP)

The `symbol` is configurable via the `BTC_SYMBOL` env var and can be overridden per-request via a query parameter, so you could query `ETHUSDT`, `SOLUSDT`, etc. without code changes.

---

## Design Goals

### 1. Single source of truth for config
`src/config.js` reads every `process.env` value in one place with typed defaults.  
No scattered `process.env.X` calls in route or lib files.

### 2. Structured logging with pino
All application logging goes through `src/logger.js` (pino). No `console.*` calls exist in application code.  
In development, `pino-pretty` formats output for readability. In production, logs are emitted as newline-delimited JSON — ideal for ingestion by Loki, Datadog, CloudWatch, etc.

Each request gets a unique `requestId` (from `X-Request-Id` header or auto-generated UUID) that propagates through every log line via a child logger. This makes distributed tracing trivial.

Key structured fields logged per request: `requestId`, `method`, `path`, `status`, `duration`, `ip`.  
Key fields logged per Ollama call: `model`, `promptLength`, `durationMs`, `evalCount`.

### 3. Clear library separation

```
src/
  config.js           — all env-based configuration
  logger.js           — singleton pino logger
  lib/
    market.js         — Binance API: getPrice(), getKlines()
    ollama.js         — Ollama: pingOllama(), generate(), buildPrompt()
  middleware/
    requestLogger.js  — attaches requestId + child logger, logs on finish
    errorHandler.js   — central 4-arg Express error handler
  routes/
    health.js         — GET /api/health
    market.js         — GET /api/market/price, GET /api/market/klines
    ask.js            — POST /api/ask
  index.js            — wires up Express, starts server, handles graceful shutdown
```

### 4. Graceful degradation in `/api/ask`
Market data is fetched with `Promise.allSettled`, so if Binance is temporarily unavailable the endpoint still calls Ollama — it just omits the market context and logs a warning. The response includes a `marketContext: null` field so callers can detect this.

### 5. Nginx as reverse proxy
`nginx.conf` is included and sets appropriate `proxy_read_timeout` (90 s) to handle slow Ollama generation, passes `X-Request-Id` downstream, and trusts `X-Forwarded-For` (matched by `app.set('trust proxy', 1)` in Express).

---

## Known Issues / Trade-offs

| Issue | Notes |
|---|---|
| No response streaming | `/api/ask` buffers the full Ollama response before replying. See "How to extend" below. |
| No caching | Every request hits Binance live. For high-traffic use, a short TTL cache (e.g. 10 s) on price would reduce latency significantly. |
| No auth | The API is open. In production, add API-key middleware or mTLS. |
| Prompt size | Only the last 5 klines are included in the prompt to keep tokens low. A larger window could improve LLM context but increases latency. |
| Single Ollama model | The model is set at startup. Multi-model routing would need a registry pattern. |

---

## How to Extend

### Streaming responses
Switch Ollama to `stream: true` and pipe the NDJSON stream directly to the Express response:

```js
// In lib/ollama.js
const { data: stream } = await client.post('/api/generate',
  { model, prompt, stream: true },
  { responseType: 'stream' }
);
res.setHeader('Content-Type', 'text/event-stream');
stream.pipe(res);
```

### Price/klines caching
Wrap `getPrice` and `getKlines` with a simple in-memory TTL map (or use `node-cache` / Redis):

```js
const cache = new Map();
async function getCached(key, ttlMs, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.value;
  const value = await fetcher();
  cache.set(key, { value, ts: Date.now() });
  return value;
}
```

### Technical indicator context
Compute RSI, MACD, or Bollinger Bands from the klines before building the prompt, so the model receives pre-calculated signals rather than raw OHLCV data. A library like `technicalindicators` (npm) makes this straightforward.

### WebSocket live feed
Replace or supplement the REST price endpoint with a Binance WebSocket stream (`wss://stream.binance.com:9443/ws/btcusdt@ticker`) to push live updates to connected clients via Server-Sent Events.

### Rate limiting
Add `express-rate-limit` on `/api/ask` to protect the Ollama instance from being overwhelmed:

```js
const rateLimit = require('express-rate-limit');
app.use('/api/ask', rateLimit({ windowMs: 60_000, max: 10 }));
```

### Persistent conversation history
Maintain a per-session message history array and include it in each Ollama call body, enabling multi-turn conversations about the market.
