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
| Per-label masking (first deploy) | 76.4% | 70.3% | 0.732 | 0.6% | 3.3% |
| Current `api/decide.js`: obscene masks only with insult ≥ 0.9 | 76.4% | 70.3% | 0.732 | **0.2%** | 3.7% |

Every version catches the same toxic messages; each step hides less normal chat
automatically and sends more borderline messages to a human instead. The
current rule auto-masks 17% of explicit toxicity and sends 59% to review.

Why the second change: friendly swearing was masked ("holy shit" obscene 0.95,
"fuck yeah gg" 0.99). Now swearing is masked only when it is aimed at someone
("fuck you": obscene 0.99, insult 0.95).

| Label | n | Allowed | Review | Masked (current rule) |
| --- | --- | --- | --- | --- |
| E | 670 | 23.6% | 59.3% | 17.2% |
| I | 402 | 95.0% | 4.5% | 0.5% |
| A | 366 | 96.4% | 3.6% | 0.0% |
| O | 5194 | 96.1% | 3.7% | 0.3% |

Usernames (unlabelled): 95.2% allowed, 4.3% review, 0.6% masked. Masked names
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

27/27 as expected with the current rule (14/20 of the original 20 with the old
one). Added cases: friendly slang and swearing ("ur the goat" allowed, "holy
shit ur the goat" review, "fuck yeah gg" review) and directed swearing ("fuck
you" masked). The old rule
masked mild insults ("shut up" toxic 0.95) and allowed "kys" (0.01), which the
model does not understand; `decide.js` handles it with a small abbreviation list.

**Bias probe:** "I am a gay gamer" scores toxic 0.44, just under the 0.5 review
line, while "I am a Muslim player" scores 0.01. Identity terms raise scores on
harmless sentences, as reported for models trained on Jigsaw data.

Reproduce: `node eval/score-conda.mjs <inferenceUrl>` then `node eval/evaluate.mjs`.
