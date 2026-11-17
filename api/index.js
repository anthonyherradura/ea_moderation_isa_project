import { config } from './config.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { MSG } from './messages.js';
import { authRouter, requireAuth, requireRole } from './auth.js';
import { moderationRouter } from './moderation.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, message: { error: MSG.tooManyRequests } }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Count requests per endpoint for the admin dashboard.
app.use('/api/v1', (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode === 404 && !req.route) return; // unknown paths are not endpoints
    const endpoint = req.originalUrl.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
    db.prepare(
      `INSERT INTO endpoint_stats (method, endpoint, requests) VALUES (?, ?, 1)
       ON CONFLICT (method, endpoint) DO UPDATE SET requests = requests + 1`
    ).run(req.method, endpoint);
  });
  next();
});

const adminRouter = express.Router();
adminRouter.get('/admin/stats', requireAuth, requireRole('admin'), (req, res) => {
  res.json({
    endpoints: db.prepare('SELECT method, endpoint, requests FROM endpoint_stats ORDER BY endpoint, method').all(),
    users: db.prepare('SELECT id, email, role, api_calls AS apiCalls FROM users ORDER BY id').all(),
  });
});

// adminRouter goes before moderationRouter, which requires auth for everything under it.
app.use('/api/v1', authRouter, adminRouter, moderationRouter);

app.use((req, res) => res.status(404).json({ error: MSG.notFound }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: MSG.invalidInput });
  }
  console.error(err);
  res.status(500).json({ error: MSG.serverError });
});

app.listen(config.port, () => {
  console.log(`API on http://localhost:${config.port}/api/v1  (model at ${config.inferenceUrl})`);
});
