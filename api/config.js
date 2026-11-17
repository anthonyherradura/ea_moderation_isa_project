import { existsSync } from 'node:fs';

// Imported first by every module, so the env file is loaded before anything reads it.
const envFile = existsSync('.env') ? '.env' : '.env.example';
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const production = env.NODE_ENV === 'production';

if (production && (!env.JWT_SECRET || env.JWT_SECRET.startsWith('dev-only'))) {
  throw new Error('JWT_SECRET must be set to a real secret in production');
}

export const config = {
  production,
  port: Number(env.PORT ?? 3000),
  clientOrigins: (env.CLIENT_ORIGINS ?? 'http://localhost:5500').split(',').map((s) => s.trim()),
  jwtSecret: env.JWT_SECRET,
  tokenTtlSeconds: 60 * 60,
  inferenceUrl: env.INFERENCE_URL ?? 'http://localhost:8000',
  inferenceTimeoutMs: 5000,
  reviewThreshold: Number(env.REVIEW_THRESHOLD ?? 0.5),
  maskThreshold: Number(env.MASK_THRESHOLD ?? 0.9),
  freeCalls: Number(env.FREE_CALLS ?? 20),
  dbFile: env.DB_FILE ?? 'data/moderation.db',
  seeds: [
    { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, role: 'admin' },
    { email: env.SEED_MODERATOR_EMAIL, password: env.SEED_MODERATOR_PASSWORD, role: 'moderator' },
  ],
};
