import { config } from './config.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { all, initDb, run } from './db.js';
import { MSG } from './messages.js';
import { authRouter, requireAuth, requireRole } from './auth.js';
import { moderationRouter } from './moderation.js';

const app = express();
app.set('trust proxy', config.trustProxy);
app.use(helmet());
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, message: { error: MSG.tooManyRequests } }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Health check for the host (no auth, not counted).
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Count requests per endpoint for the admin dashboard.
app.use('/api/v1', (req, res, next) => {
  res.on('finish', () => {
    // Count by the matched route pattern (e.g. /reviews/:id), never the raw URL,
    // so made-up paths cannot add rows to this table.
    if (!req.route) return;
    run(
      `INSERT INTO endpoint_stats (method, endpoint, requests) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE requests = requests + 1`,
      [req.method, `/api/v1${req.route.path}`]
    ).catch((err) => console.error('endpoint_stats update failed:', err.message));
  });
  next();
});

const adminRouter = express.Router();
adminRouter.get('/admin/stats', requireAuth, requireRole('admin'), async (req, res) => {
  res.json({
    endpoints: await all('SELECT method, endpoint, requests FROM endpoint_stats ORDER BY endpoint, method'),
    users: await all('SELECT id, email, role, api_calls AS apiCalls FROM users ORDER BY id'),
  });
});

// adminRouter goes before moderationRouter, which requires auth for its own paths.
app.use('/api/v1', authRouter, adminRouter, moderationRouter);

app.use((req, res) => res.status(404).json({ error: MSG.notFound }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: MSG.invalidInput });
  }
  console.error(err);
  res.status(500).json({ error: MSG.serverError });
});

await initDb();
app.listen(config.port, () => {
  console.log(`API on port ${config.port} /api/v1  (model at ${config.inferenceUrl})`);
});
