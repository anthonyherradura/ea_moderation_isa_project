// Turns the model's six label scores into OUR decision. The thresholds belong
// to the API, not the model, and were tuned with eval/ (CONDA Dota 2 chat set
// plus hand-written cases). Shared by the API and the evaluation scripts.
//
// toxic-bert's general "toxic" label is high for any rudeness ("shut up" scores
// 0.95), so it only sends a message to human review. Masking needs one of the
// specific serious labels to be high.

export const REVIEW_AT = 0.5;
export const MASK_AT = { threat: 0.7, severe_toxic: 0.5, identity_hate: 0.5, obscene: 0.9 };

// Gamer abbreviations the model does not understand (it scores "kys" 0.01).
// Matched as whole words, also when spelled out with spaces or dots ("k y s").
const ALWAYS_MASK = new Set(['kys', 'kysnow', 'killyourself', 'neckyourself']);

function blocklisted(text) {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const words = [];
  for (let i = 0; i < tokens.length; i++) {
    // Join runs of single letters: "k y s" -> "kys"
    if (tokens[i].length === 1) {
      let run = '';
      while (i < tokens.length && tokens[i].length === 1) run += tokens[i++];
      i--;
      words.push(run);
    } else words.push(tokens[i]);
  }
  return words.some((w) => ALWAYS_MASK.has(w)) || ALWAYS_MASK.has(tokens.join(''));
}

/** @returns {{decision: 'allowed'|'review'|'masked', topLabel: string, topScore: number}} */
export function decide(text, scores, reviewAt = REVIEW_AT) {
  const [topLabel, topScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const serious = Object.entries(MASK_AT).some(([label, at]) => scores[label] >= at);
  const decision = serious || blocklisted(text) ? 'masked' : topScore >= reviewAt ? 'review' : 'allowed';
  return { decision, topLabel, topScore };
}
