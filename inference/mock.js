// MOCK inference service for local development only. It is NOT the AI model:
// it matches a few keywords and returns scores in the same shape as app.py,
// so the API, review queue and client can be built without loading toxic-bert.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8000);

const HIGH = { 'kill yourself': 'threat', kys: 'threat', fuck: 'obscene', bitch: 'obscene' };
const MID = { idiot: 'insult', stupid: 'insult', trash: 'insult', loser: 'insult', noob: 'insult', dumb: 'insult', hate: 'toxic', suck: 'toxic' };

function score(text) {
  const scores = { toxic: 0.01, severe_toxic: 0.01, obscene: 0.01, threat: 0.01, insult: 0.01, identity_hate: 0.01 };
  const lower = text.toLowerCase();
  for (const [word, label] of Object.entries(MID)) {
    if (lower.includes(word)) scores[label] = Math.max(scores[label], 0.7);
  }
  for (const [word, label] of Object.entries(HIGH)) {
    if (lower.includes(word)) scores[label] = Math.max(scores[label], 0.97);
  }
  scores.toxic = Math.max(...Object.values(scores)); // any hit is also "toxic"
  return scores;
}

createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', model: 'MOCK' });
  if (req.method !== 'POST' || req.url !== '/predict') return send(404, { detail: 'Not found' });

  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    try {
      const { text } = JSON.parse(raw);
      if (typeof text !== 'string' || !text) return send(422, { detail: 'text is required' });
      send(200, { scores: score(text) });
    } catch {
      send(422, { detail: 'invalid JSON' });
    }
  });
}).listen(PORT, () => console.log(`MOCK inference (keyword matcher, not the model) on http://localhost:${PORT}`));
