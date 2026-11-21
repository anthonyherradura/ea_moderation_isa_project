// Compares threshold rules on the cached CONDA scores (run score-conda.mjs first).
//
//   node eval/evaluate.mjs
//
// CONDA intent labels: E = explicit toxicity, I = implicit toxicity,
// A = action (game commands), O = other (normal chat).
// "Flagged" = sent to review or masked. A good rule flags E, rarely masks O/A.
import { readFileSync } from 'node:fs';
import { decide } from '../api/decide.js';

const { messages, usernames } = JSON.parse(readFileSync('eval/data/scores.json', 'utf8'));

const rules = {
  'old: max score, review 0.5 / mask 0.9': (text, s) => {
    const top = Math.max(...Object.values(s));
    return top >= 0.9 ? 'masked' : top >= 0.5 ? 'review' : 'allowed';
  },
  'new: api/decide.js': (text, s) => decide(text, s).decision,
};

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1).padStart(5) + '%' : '    -');

for (const [name, rule] of Object.entries(rules)) {
  const counts = {};
  for (const m of messages) {
    const d = rule(m.text, m.scores);
    counts[m.label] ??= { allowed: 0, review: 0, masked: 0, n: 0 };
    counts[m.label][d]++;
    counts[m.label].n++;
  }
  const flagged = (c) => c.review + c.masked;
  const E = counts.E, clean = ['O', 'A'].map((k) => counts[k]).reduce((a, c) => ({
    n: a.n + c.n, review: a.review + c.review, masked: a.masked + c.masked,
  }), { n: 0, review: 0, masked: 0 });
  const tp = flagged(E), fp = flagged(clean);
  const precision = tp / (tp + fp), recall = tp / E.n;

  console.log(`\n== ${name}`);
  console.log('label     n   allowed  review  masked');
  for (const [k, c] of Object.entries(counts).sort()) {
    console.log(`${k.padEnd(5)}${String(c.n).padStart(6)}  ${pct(c.allowed, c.n)}  ${pct(c.review, c.n)}  ${pct(c.masked, c.n)}`);
  }
  console.log(`explicit toxicity (E) flagged: recall ${pct(tp, E.n)}, precision ${pct(tp, tp + fp)}, F1 ${(2 * precision * recall / (precision + recall)).toFixed(3)}`);
  console.log(`normal chat (O+A) wrongly masked: ${pct(clean.masked, clean.n)}  wrongly sent to review: ${pct(clean.review, clean.n)}`);

  const names = { allowed: 0, review: 0, masked: 0 };
  for (const u of usernames) names[rule(u.text, u.scores)]++;
  console.log(`usernames (${usernames.length} Dota 2 player names, unlabelled): allowed ${pct(names.allowed, usernames.length)}, review ${pct(names.review, usernames.length)}, masked ${pct(names.masked, usernames.length)}`);
}

// Examples for the report: what the new rule masks / misses.
const show = (title, list) => {
  console.log(`\n-- ${title}`);
  for (const m of list.slice(0, 12)) {
    const top = Object.entries(m.scores).sort((a, b) => b[1] - a[1])[0];
    console.log(`  ${top[0]} ${top[1].toFixed(2)}  ${JSON.stringify(m.text)}`);
  }
};
const byScore = (a, b) => Math.max(...Object.values(b.scores)) - Math.max(...Object.values(a.scores));
show('normal chat (O) the new rule masks', messages.filter((m) => m.label === 'O' && decide(m.text, m.scores).decision === 'masked').sort(byScore));
show('explicit toxicity (E) the new rule allows', messages.filter((m) => m.label === 'E' && decide(m.text, m.scores).decision === 'allowed'));
show('usernames the new rule masks', usernames.filter((u) => decide(u.text, u.scores).decision === 'masked').sort(byScore));
show('usernames sent to review', usernames.filter((u) => decide(u.text, u.scores).decision === 'review').sort(byScore));
