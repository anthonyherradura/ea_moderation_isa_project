// Starts the API, the client, and (unless --no-mock) the mock inference service.
// Use --no-mock when the real toxic-bert service is running on port 8000.
import { spawn } from 'node:child_process';

const scripts = ['api/index.js', 'client/serve.js'];
if (!process.argv.includes('--no-mock')) scripts.push('inference/mock.js');

// The API always gets its own port here, even if the shell has PORT set for something else.
const env = { ...process.env, PORT: process.env.API_PORT ?? '3000' };
const children = scripts.map((script) => spawn(process.execPath, [script], { stdio: 'inherit', env }));
const stopAll = () => children.forEach((child) => child.kill());

children.forEach((child) => child.on('exit', stopAll));
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
