import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one, run } from './db.js';
import { MSG } from './messages.js';

const COOKIE = 'token';
const cookieOptions = {
  httpOnly: true,
  // Client and API are on different sites in production, so the cookie must be
  // SameSite=None; Secure. Locally (http://localhost:*) Lax works without HTTPS.
  secure: config.production,
  sameSite: config.production ? 'none' : 'lax',
  maxAge: config.tokenTtlSeconds * 1000,
};

/** Rejects the request with 400 if any express-validator check failed. */
export function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  res.status(400).json({ error: MSG.invalidInput, details: errors.array().map((e) => `${e.path}: ${e.msg}`) });
}

/** Requires a valid JWT cookie. The role is read from the database on every
 *  request, never from the token or the client. */
export async function requireAuth(req, res, next) {
  let sub;
  try {
    ({ sub } = jwt.verify(req.cookies[COOKIE] ?? '', config.jwtSecret));
  } catch {
    // bad or missing token: fall through with no user
  }
  if (sub) req.user = await one('SELECT id, email, role, api_calls FROM users WHERE id = ?', [sub]);
  if (!req.user) return res.status(401).json({ error: MSG.notLoggedIn });
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: MSG.forbidden });

export const isModerator = (user) => user.role === 'moderator' || user.role === 'admin';

const profile = (u) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  apiCalls: u.api_calls,
  freeCalls: config.freeCalls,
});

const credentials = [
  body('email').isEmail().isLength({ max: 254 }).normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 72 }),
  validate,
];

export const authRouter = Router();

authRouter.post('/auth/register', credentials, async (req, res) => {
  const { email, password } = req.body;
  // Only email and password are taken from the body; role is always 'user'.
  try {
    const { insertId } = await run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [
      email,
      await bcrypt.hash(password, 10),
    ]);
    res.status(201).json({ id: insertId, email, role: 'user' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: MSG.emailTaken });
    throw err;
  }
});

authRouter.post('/auth/login', credentials, async (req, res) => {
  const { email, password } = req.body;
  const user = await one('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: MSG.badLogin });
  }
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.tokenTtlSeconds });
  res.cookie(COOKIE, token, cookieOptions).json(profile(user));
});

authRouter.post('/auth/logout', (req, res) => {
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(COOKIE, clearOptions).json({ message: MSG.loggedOut });
});

authRouter.get('/users/me', requireAuth, (req, res) => res.json(profile(req.user)));
