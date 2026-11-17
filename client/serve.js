// Tiny static file server so the client runs on its own origin (port 5500),
// separate from the API (port 3000). In production any static host will do.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CLIENT_PORT ?? 5500);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
}).listen(PORT, () => console.log(`Client on http://localhost:${PORT}`));
