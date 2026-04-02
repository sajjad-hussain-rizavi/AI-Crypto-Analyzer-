'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../logger');

/** Reusable axios instance scoped to Ollama */
const client = axios.create({
  baseURL: config.ollama.baseUrl,
  timeout: config.ollama.timeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Check whether the local Ollama service is reachable.
 * @returns {Promise<"reachable"|"unreachable">}
 */
async function pingOllama() {
  try {
    await client.get('/', { timeout: 3000 });
    return 'reachable';
  } catch {
    return 'unreachable';
  }
}

/**
 * Send a prompt to Ollama and return the generated text.
 * Uses the non-streaming /api/generate endpoint so the full response
 * arrives in one JSON object — simpler for this assessment.
 *
 * @param {string} prompt      - The full prompt string
 * @param {string} [model]     - Override the default model
 * @returns {Promise<{ answer: string, model: string, durationMs: number }>}
 */
async function generate(prompt, model = config.ollama.model) {
  const log = logger.child({ fn: 'generate', model });
  const t0 = Date.now();

  log.info({ promptLength: prompt.length }, 'Sending prompt to Ollama');

let data;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      ({ data } = await client.post('/api/generate', {
        model,
        prompt,
        stream: false,
      }));
      break; // success — exit retry loop
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED';
      if (isTimeout && attempt === 1) {
        log.warn({ attempt }, 'Ollama timed out — retrying once');
        continue;
      }
      const durationMs = Date.now() - t0;
      log.error({ durationMs, err: err.message }, 'Ollama generation failed');
      throw normaliseError(err);
    }
  }

    const durationMs = Date.now() - t0;
    log.info(
      {
        durationMs,
        evalCount: data.eval_count,
        promptEvalCount: data.prompt_eval_count,
      },
      'Ollama generation complete'
    );

    return {
      answer: (data.response || '').trim(),
      model: data.model || model,
      durationMs,
    };
  
}

/**
 * Build a context-enriched prompt from a user question + optional market data
 * + optional prior conversation history.
 *
 * @param {string}  question
 * @param {Object}  [marketContext]
 * @param {Array}   [history]  - [{role:'user'|'assistant', content:string}]
 * @returns {string}
 */
function buildPrompt(question, marketContext, history = []) {
  const lines = [
    'You are a knowledgeable cryptocurrency market analyst assistant.',
    'Answer the user question concisely and factually.',
    'You have access to live Bitcoin market data provided below.',
    'When referencing prices or trends, use the data provided.',
    '',
  ];

  if (marketContext) {
    const { symbol, price, klines, fetchedAt } = marketContext;

    if (price) {
      lines.push(`## Live Market Data (as of ${fetchedAt || 'now'})`);
      lines.push(`- Symbol : ${symbol || 'BTCUSDT'}`);
      lines.push(`- Current price : $${price}`);
      lines.push('');
    }

    if (klines && klines.length > 0) {
      const recent = klines.slice(-5);
      lines.push(`## Recent Klines (last ${recent.length} candles)`);
      lines.push('openTime | open | high | low | close | volume');
      for (const k of recent) {
        lines.push(
          `${k.openTime} | ${k.open} | ${k.high} | ${k.low} | ${k.close} | ${k.volume}`
        );
      }
      lines.push('');
    }
  }

  // Inject prior conversation turns so the model has memory
  if (history.length > 0) {
    lines.push('## Conversation History');
    for (const turn of history) {
      const role = turn.role === 'assistant' ? 'Assistant' : 'User';
      lines.push(`${role}: ${turn.content}`);
    }
    lines.push('');
  }

  lines.push('## Current Question');
  lines.push(`User: ${question}`);
  lines.push('Assistant:');

  return lines.join('\n');
}

function normaliseError(err) {
  const status = err.response?.status || 502;
  const message =
    err.code === 'ECONNABORTED'
      ? 'Ollama request timed out — the model may still be loading'
      : err.response?.data?.error || err.message || 'Ollama request failed';
  return Object.assign(new Error(message), { status });
}

module.exports = { pingOllama, generate, buildPrompt };
