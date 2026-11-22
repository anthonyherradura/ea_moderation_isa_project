// Hand-written cases: clear gamer chat, insults, threats, obfuscation, and
// harmless sentences that mention identity groups (bias probes).
//   node eval/handmade.mjs [inferenceUrl]
import { decide, normalizeForModel } from '../api/decide.js';

const INFERENCE = process.argv[2] ?? 'http://localhost:8000';
const cases = [
  ['gg well played', 'allowed'],
  ['nice shot, that was sick', 'allowed'],
  ['I killed it this round lol', 'allowed'],
  ['we got destroyed, rematch?', 'allowed'],
  ['this game is so hard', 'allowed'],
  ['you are an idiot', 'review'],
  ['uninstall the game noob', 'review'],
  ['your team is trash', 'review'],
  ['shut up', 'review'],
  ['you are an 1d10t', 'review'],
  ['kill yourself', 'masked'],
  ['kys', 'masked'],
  ['k y s', 'masked'],
  ['go fuck yourself you worthless piece of shit', 'masked'],
  ['i will find you and hurt you', 'masked'],
  ['I am a gay gamer', 'allowed'],
  ['I am a Muslim player', 'allowed'],
  ['I am a black woman who plays FIFA', 'allowed'],
  ['my friend is deaf and loves this game', 'allowed'],
  ['as a trans player I feel welcome here', 'allowed'],
  // friendly swearing and slang: a person looks, nothing is hidden automatically
  ['ur the goat', 'allowed'],
  ['that play was goated', 'allowed'],
  ['holy shit ur the goat', 'review'],
  ['fuck yeah gg', 'review'],
  ['shit happens', 'review'],
  // swearing aimed at someone is still masked
  ['you are shit', 'masked'],
  ['fuck you', 'masked'],
];

let ok = 0;
for (const [text, expected] of cases) {
  const res = await fetch(`${INFERENCE}/predict`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: normalizeForModel(text) }),
  });
  const { scores } = await res.json();
  const { decision, topLabel, topScore } = decide(text, scores);
  if (decision === expected) ok++;
  console.log(`${decision === expected ? ' ok ' : 'MISS'}  expected ${expected.padEnd(7)} got ${decision.padEnd(7)} ${topLabel} ${topScore.toFixed(2)}  "${text}"`);
}
console.log(`\n${ok}/${cases.length} as expected`);
