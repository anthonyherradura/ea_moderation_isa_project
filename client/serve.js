// Tiny static file server so the client runs on its own origin (port 5500),
// separate from the API (port 3000). /config.js is generated from API_URL so
// the same files work locally and when deployed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CLIENT_PORT ?? process.env.PORT ?? 5500);
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const CONFIG_JS = `const API = ${JSON.stringify(API_URL)};
`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }).end(CONFIG_JS);
    return;
  }
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT + sep) || !TYPES[extname(file)] || file.endsWith('serve.js')) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${TYPES[extname(file)]}; charset=utf-8` }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`Client on port ${PORT} (API at ${API_URL})`));
