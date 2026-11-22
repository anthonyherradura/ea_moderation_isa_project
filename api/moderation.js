import { Router } from 'express';
import { body, param } from 'express-validator';
import { config } from './config.js';
import { all, one, run } from './db.js';
import { decide, normalizeForModel } from './decide.js';
import { predict } from './inference.js';
import { MSG } from './messages.js';
import { requireAuth, isModerator, validate } from './auth.js';

export const moderationRouter = Router();
// Only on this router's own paths, so unknown /api/v1/* paths still get a 404.
moderationRouter.use(['/messages', '/usernames', '/reviews'], requireAuth);

const mask = (text) => text.replace(/\S/g, '*');

/** Scores one piece of text and applies OUR thresholds. The model only advises:
 *  the worst it can do by itself is mask a message, and that can be overturned. */
async function moderate(user, kind, text) {
  await run('UPDATE users SET api_calls = api_calls + 1 WHERE id = ?', [user.id]);
  const apiCalls = user.api_calls + 1;

  let scores = null;
  let topLabel = null;
  let topScore = null;
  let decision;
  let aiDecision;
  try {
    scores = await predict(normalizeForModel(text));
    ({ decision, topLabel, topScore } = decide(text, scores, config.reviewThreshold));
    aiDecision = decision;
  } catch (err) {
    // Fallback: if the model is down, a human looks at it instead of the request failing.
    console.warn(`inference failed (${err.message}); sending to review queue`);
    decision = 'review';
    aiDecision = 'fallback';
  }

  const { insertId: messageId } = await run(
    'INSERT INTO messages (user_id, kind, decision, top_label, top_score) VALUES (?, ?, ?, ?, ?)',
    [user.id, kind, decision, topLabel, topScore]
  );

  let caseId = null;
  if (decision !== 'allowed') {
    ({ insertId: caseId } = await run(
      `INSERT INTO review_cases (message_id, user_id, kind, text, ai_decision, top_label, top_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [messageId, user.id, kind, text, aiDecision, topLabel, topScore]
    ));
  }

  const warnings = [];
  if (aiDecision === 'fallback') warnings.push(MSG.inferenceDown);
  if (apiCalls > config.freeCalls) warnings.push(MSG.overFreeLimit(config.freeCalls));

  return {
    decision,
    displayText: decision === 'masked' ? mask(text) : text,
    topLabel,
    topScore,
    scores,
    caseId,
    usage: { apiCalls, freeCalls: config.freeCalls },
    warnings,
  };
}

moderationRouter.post(
  '/messages/score',
  body('text').isString().trim().isLength({ min: 1, max: 500 }),
  validate,
  async (req, res) => res.json(await moderate(req.user, 'message', req.body.text))
);

moderationRouter.post(
  '/usernames/check',
  body('username').isString().trim().isLength({ min: 3, max: 20 }),
  validate,
  async (req, res) => {
    const result = await moderate(req.user, 'username', req.body.username);
    const { displayText, ...rest } = result;
    res.json({ ...rest, acceptable: result.decision === 'allowed' });
  }
);

// ---- Review cases ----------------------------------------------------------

const caseJson = (c) => ({
  id: c.id,
  userId: c.user_id,
  userEmail: c.user_email,
  kind: c.kind,
  text: c.text,
  aiDecision: c.ai_decision,
  topLabel: c.top_label,
  topScore: c.top_score,
  status: c.status,
  appealNote: c.appeal_note,
  decisionNote: c.decision_note,
  decidedBy: c.decided_by_email,
  decidedAt: c.decided_at,
  createdAt: c.created_at,
});

const CASE_SELECT = `
  SELECT c.*, u.email AS user_email, m.email AS decided_by_email
  FROM review_cases c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN users m ON m.id = c.decided_by`;

const idParam = [param('id').isInt({ min: 1 }).toInt(), validate];

/** Loads the case, and 404s if it does not exist or this user may not see it. */
async function loadCase(req, res, next) {
  const found = await one(`${CASE_SELECT} WHERE c.id = ?`, [req.params.id]);
  if (!found || (found.user_id !== req.user.id && !isModerator(req.user))) {
    return res.status(404).json({ error: MSG.notFound });
  }
  req.reviewCase = found;
  next();
}

moderationRouter.get('/reviews', async (req, res) => {
  const rows = isModerator(req.user)
    ? await all(`${CASE_SELECT} ORDER BY c.id DESC`)
    : await all(`${CASE_SELECT} WHERE c.user_id = ? ORDER BY c.id DESC`, [req.user.id]);
  res.json(rows.map(caseJson));
});

moderationRouter.get('/reviews/:id', idParam, loadCase, (req, res) => res.json(caseJson(req.reviewCase)));

moderationRouter.patch(
  '/reviews/:id',
  idParam,
  body('decision').optional().isIn(['uphold', 'overturn']),
  body('note').optional().isString().trim().isLength({ max: 500 }),
  body('appealNote').optional().isString().trim().isLength({ min: 1, max: 500 }),
  validate,
  loadCase,
  async (req, res) => {
    // Only these three fields are ever read from the body.
    const { decision, note, appealNote } = req.body;
    const current = req.reviewCase;

    if (decision) {
      if (!isModerator(req.user)) return res.status(403).json({ error: MSG.forbidden });
      await run(
        `UPDATE review_cases
         SET status = ?, decision_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [decision === 'uphold' ? 'upheld' : 'overturned', note ?? null, req.user.id, current.id]
      );
    } else if (appealNote) {
      if (current.user_id !== req.user.id) return res.status(403).json({ error: MSG.forbidden });
      if (current.status === 'overturned') return res.status(409).json({ error: MSG.alreadyDecided });
      // An appeal puts the case back in front of a moderator.
      await run(`UPDATE review_cases SET appeal_note = ?, status = 'pending' WHERE id = ?`, [appealNote, current.id]);
    } else {
      return res.status(400).json({ error: MSG.nothingToUpdate });
    }
    res.json(caseJson(await one(`${CASE_SELECT} WHERE c.id = ?`, [current.id])));
  }
);

moderationRouter.delete('/reviews/:id', idParam, loadCase, async (req, res) => {
  const isOwner = req.reviewCase.user_id === req.user.id;
  if (!isOwner && req.user.role !== 'admin') return res.status(403).json({ error: MSG.forbidden });
  await run('DELETE FROM review_cases WHERE id = ?', [req.reviewCase.id]);
  res.json({ message: MSG.deleted });
});
