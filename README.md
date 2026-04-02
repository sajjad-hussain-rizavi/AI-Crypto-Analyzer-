Make sure you have a local llm installed. 
Follow these steps to get started


Create a .env file
```
echo $null > .env.example
```
Open parent folder in terminal and run
```
cp .env.example .env
```
Then paste in terminal
```
# ── Server ────────────────────────────────────────────────────────
PORT=3002
NODE_ENV=development

# ── Ollama ────────────────────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=<Your-local-model>
# Timeout in milliseconds for Ollama generation requests
OLLAMA_TIMEOUT_MS=60000

# ── Binance ───────────────────────────────────────────────────────
BINANCE_BASE_URL=https://api.binance.com
BTC_SYMBOL=BTCUSDT
# Timeout in milliseconds for Binance API requests
BINANCE_TIMEOUT_MS=10000

# ── Logging ───────────────────────────────────────────────────────
# 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
LOG_LEVEL=info


```
INSTALL DEPENDENCIES
```
npm install
```
RUN HEALTH CHECKS
```
node check.js
```
START THE SERVER
```
npm start
```
CHAT WITH AI(in another terminal)
```
node chat.js
```
