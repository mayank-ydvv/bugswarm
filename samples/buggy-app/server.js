import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const root = join(import.meta.dirname, 'public');

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // BUG (semgrep): evaluates user input.
  if (url.pathname === '/api/calc') {
    const result = eval(url.searchParams.get('expr') ?? '0');
    res.end(JSON.stringify({ result }));
    return;
  }

  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`buggy-app on :${PORT}`));
