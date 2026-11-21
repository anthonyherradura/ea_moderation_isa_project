// Scores the CONDA validation set (Dota 2 in-game chat, Weld et al., ACL 2021)
// with the inference service and caches the raw scores, so threshold rules can
// be compared without re-running the model.
//
//   node eval/score-conda.mjs [inferenceUrl]     (default http://localhost:8000)
//
// The data is downloaded from github.com/usydnlp/CONDA into eval/data/ (git-ignored,
// the dataset has no licence file, so it is not redistributed in this repo).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const INFERENCE = process.argv[2] ?? 'http://localhost:8000';
const DIR = 'eval/data';
const SRC = 'https://raw.githubusercontent.com/usydnlp/CONDA/main';
const FILES = { valid: `${SRC}/data/CONDA_valid.csv`, lexicon: `${SRC}/resources/lexicon_refined_1209.csv` };

mkdirSync(DIR, { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
  const file = `${DIR}/${name}.csv`;
  if (!existsSync(file)) writeFileSync(file, await (await fetch(url)).text());
}

/** Minimal RFC 4180 CSV parser (quoted fields, "" escapes, newlines in quotes). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...lines] = parseCsv(readFileSync(`${DIR}/valid.csv`, 'utf8'));
const col = (name) => header.indexOf(name);
const rows = lines.filter((r) => r.length === header.length);

// Single-message rows only: [SEPA] joins several chat lines under one label.
const messages = rows
  .filter((r) => !r[col('utterance')].includes('[SEPA]') && r[col('utterance')].trim())
  .map((r) => ({ text: r[col('utterance')].trim().slice(0, 500), label: r[col('intentClass')] }));
const usernames = [...new Set(rows.map((r) => r[col('playerId')].trim()))]
  .filter((u) => u.length >= 1)
  .map((u) => ({ text: u.slice(0, 500) }));

async function score(text) {
  const res = await fetch(`${INFERENCE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${JSON.stringify(text)}`);
  return (await res.json()).scores;
}

async function scoreAll(items, label) {
  const out = [];
  for (const [i, item] of items.entries()) {
    out.push({ ...item, scores: await score(item.text) });
    if ((i + 1) % 500 === 0) console.log(`${label}: ${i + 1}/${items.length}`);
  }
  return out;
}

const t0 = Date.now();
const result = { messages: await scoreAll(messages, 'messages'), usernames: await scoreAll(usernames, 'usernames') };
writeFileSync(`${DIR}/scores.json`, JSON.stringify(result));
console.log(`Scored ${result.messages.length} messages and ${result.usernames.length} usernames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
