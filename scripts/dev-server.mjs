// Lokaler Server für Entwicklung und Browser-Tests gegen die Firebase-Emulatoren.
// Stellt public/ und api/ bereit und wendet die Header aus vercel.json an.
// Start: npx firebase emulators:exec --only firestore,auth --project demo-body-tracking "node scripts/dev-server.mjs"
// Danach: http://localhost:3000/?emulator=1
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const publicDir = join(root, 'public');
const port = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const headers = {};
config.headers.find(h => h.source === '/(.*)').headers.forEach(h => { headers[h.key] = h.value; });
// Nur lokal: Der Browser muss die Emulatoren erreichen dürfen.
headers['Content-Security-Policy'] = headers['Content-Security-Policy']
  .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8080 ws://127.0.0.1:8080 http://127.0.0.1:9099");

async function handleApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length);
  if (!/^[a-z-]+$/.test(name)) { res.writeHead(404); return res.end(); }
  let mod;
  try { mod = await import(pathToFileURL(join(root, 'api', name + '.js')).href); } catch { res.writeHead(404); return res.end(); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  const shim = {
    code: 200,
    status(c) { this.code = c; return this; },
    json(data) { res.writeHead(this.code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  };
  await mod.default({ method: req.method, headers: req.headers, body, query: Object.fromEntries(url.searchParams) }, shim);
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = normalize(join(publicDir, rel));
    if (!file.startsWith(publicDir + sep) || !(await stat(file)).isFile()) throw new Error('nicht gefunden');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) {
    if (!res.headersSent) res.writeHead(404);
    res.end('Nicht gefunden');
  }
}).listen(port, () => console.log(`Bereit: http://localhost:${port}/?emulator=1`));

// emulators:exec beendet die Emulatoren, sobald dieser Prozess endet.
await new Promise(() => {});
