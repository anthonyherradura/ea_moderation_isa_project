// Starts the API, the client, and (unless --no-mock) the mock inference service.
// Use --no-mock when the real toxic-bert service is running (see INFERENCE_URL).
import { spawn } from 'node:child_process';

const { PORT, ...base } = process.env; // each process gets its own port below
const processes = [
  ['api/index.js', { PORT: process.env.API_PORT ?? '3000' }],
  ['client/serve.js', {}],
];
if (!process.argv.includes('--no-mock')) processes.push(['inference/mock.js', {}]);

const children = processes.map(([script, env]) =>
  spawn(process.execPath, [script], { stdio: 'inherit', env: { ...base, ...env } })
);
const stopAll = () => children.forEach((child) => child.kill());

children.forEach((child) => child.on('exit', stopAll));
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
