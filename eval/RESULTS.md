# Evaluation results (2026-11-21)

Model: `unitary/toxic-bert` (revision 4d6c22e), CPU, ~30 ms per message, ~800 MB RAM.

## CONDA validation set (Dota 2 in-game chat)

6,632 single-line messages and 5,162 distinct player names from
[CONDA](https://github.com/usydnlp/CONDA) (Weld et al., ACL Findings 2021).
Labels: E = explicit toxicity, I = implicit toxicity, A = game action, O = other.
"Flagged" = sent to review or masked.

| Rule | E flagged (recall) | Precision | F1 | O+A wrongly masked | O+A sent to review |
| --- | --- | --- | --- | --- | --- |
| Old: highest score, review 0.5 / mask 0.9 | 76.4% | 70.5% | 0.734 | 1.3% | 2.5% |
| New: `api/decide.js` | 76.4% | 70.3% | 0.732 | **0.6%** | 3.3% |

The new rule catches the same toxic messages but halves wrongly masked normal
chat: borderline insults go to a human instead of being hidden automatically.

| Label | n | Allowed | Review | Masked (new rule) |
| --- | --- | --- | --- | --- |
| E | 670 | 23.6% | 33.3% | 43.1% |
| I | 402 | 95.0% | 4.2% | 0.7% |
| A | 366 | 96.4% | 2.7% | 0.8% |
| O | 5194 | 96.1% | 3.3% | 0.6% |

Usernames (unlabelled): 95.2% allowed, 3.3% review, 1.5% masked. Masked names
are clear profanity ("Fuck Some bitches.(ONLYMID)"); review catches milder ones
("Im with this stupid", "Piss On Your Grave").

**What the model misses (24% of explicit toxicity):** game-specific slang and
context it was never trained on: "noob qop", "cyka", "FEED", "report puck pls",
"Slardar afk", and the "viva peru" taunts aimed at Peruvian players. Implicit
toxicity (I) is almost never flagged (5%). This supports the human review
queue and player reports rather than relying on the model alone.

**Label noise:** some CONDA "O" rows are plainly obscene ("fuck u", "and you can
fuck off too"), so part of the "wrongly masked" figure is the dataset, not the model.

## Hand-written cases (`eval/handmade.mjs`)

20/20 as expected with the new rule (14/20 with the old one). The old rule
masked mild insults ("shut up" toxic 0.95) and allowed "kys" (0.01), which the
model does not understand; `decide.js` handles it with a small abbreviation list.

**Bias probe:** "I am a gay gamer" scores toxic 0.44, just under the 0.5 review
line, while "I am a Muslim player" scores 0.01. Identity terms raise scores on
harmless sentences, as reported for models trained on Jigsaw data.

Reproduce: `node eval/score-conda.mjs <inferenceUrl>` then `node eval/evaluate.mjs`.
