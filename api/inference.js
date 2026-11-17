import { config } from './config.js';

// Adapter for the inference service: 5 s timeout, one retry, and a simple
// circuit breaker that stops calling for a while after repeated failures.
const LABELS = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate'];
const FAILURES_TO_OPEN = 3;
const OPEN_MS = 30_000;

let failures = 0;
let openUntil = 0;

async function callOnce(text) {
  const res = await fetch(`${config.inferenceUrl}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(config.inferenceTimeoutMs),
  });
  if (!res.ok) throw new Error(`inference service returned HTTP ${res.status}`);
  const { scores } = await res.json();

  // Model output is untrusted: keep only the known labels and require 0..1 numbers.
  const clean = {};
  for (const label of LABELS) {
    const value = scores?.[label];
    if (typeof value !== 'number' || !(value >= 0 && value <= 1)) {
      throw new Error(`inference service returned a bad score for "${label}"`);
    }
    clean[label] = value;
  }
  return clean;
}

/** Returns the six label scores, or throws if the model cannot be reached. */
export async function predict(text) {
  if (Date.now() < openUntil) throw new Error('inference circuit breaker is open');

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const scores = await callOnce(text);
      failures = 0;
      return scores;
    } catch (err) {
      lastError = err;
    }
  }
  if (++failures >= FAILURES_TO_OPEN) {
    failures = 0;
    openUntil = Date.now() + OPEN_MS;
  }
  throw lastError;
}
