import { existsSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';

// Imported first by every module, so the env file is loaded before anything reads it.
// Values already in the environment win. In production nothing is loaded from disk:
// every setting must come from the host, so a forgotten variable can never fall
// back to the test values in .env.example (e.g. the seed admin password).
if (!production) {
  const envFile = existsSync('.env') ? '.env' : '.env.example';
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const env = process.env;

function required(name) {
  if (!env[name]) throw new Error(`${name} must be set`);
  return env[name];
}

if (production && (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.startsWith('dev-only'))) {
  throw new Error('JWT_SECRET must be set to a real secret (32+ characters) in production');
}

export const config = {
  production,
  port: Number(env.PORT ?? 3000),
  clientOrigins: required('CLIENT_ORIGINS').split(',').map((s) => s.trim()),
  jwtSecret: env.JWT_SECRET,
  tokenTtlSeconds: 60 * 60,
  databaseUrl: required('DATABASE_URL'),
  inferenceUrl: required('INFERENCE_URL'),
  inferenceTimeoutMs: 5000,
  reviewThreshold: Number(env.REVIEW_THRESHOLD ?? 0.5),
  freeCalls: Number(env.FREE_CALLS ?? 20),
  // Number of reverse proxies in front of the API (1 on Railway), so the rate
  // limiter sees the real client IP instead of the proxy's.
  trustProxy: Number(env.TRUST_PROXY ?? 0),
  seeds: [
    { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, role: 'admin' },
    { email: env.SEED_MODERATOR_EMAIL, password: env.SEED_MODERATOR_PASSWORD, role: 'moderator' },
  ],
};
