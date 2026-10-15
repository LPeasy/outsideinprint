// Loopback-only preview over an existing rendered site. Serves this worktree's
// Bob sources and runtime, preserving the published pages and catalog fixture.
// This helper cannot deploy or read provider credentials.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const get = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
if (!args.includes('--site-dir')) throw new Error('Pass --site-dir <existing rendered site>.');
const root = fileURLToPath(new URL('../../..', import.meta.url));
const site = path.resolve(get('--site-dir'));
const port = Number(get('--port', '8772'));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
const origin = `http://127.0.0.1:${port}`;
const api = new URL(get('--api-origin', 'http://127.0.0.1:8788'));
if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(api.hostname) || api.username || api.password || api.pathname !== '/' || api.search || api.hash) throw new Error('API must be a loopback HTTP origin.');
if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error('Rendered homepage missing.');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.woff2':'font/woff2'};
const attribute = (tag, name, value) => tag.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\x60]+)`, 'i'), ` ${name}="${value}"`);
function overlay(html) {
  return html.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
    const match = /\bdata-oip-persistent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const key = match && (match[1] || match[2] || match[3]);
    const assets = {'bob-script':['src','/__bob-source/js/companion-bob.js'],'bob-css':['href','/__bob-source/css/companion-bob.css'],'bob-reading-css':['href','/__bob-source/css/companion-bob-reading.css']};
    if (!assets[key]) return tag;
    return attribute(tag, ...assets[key]).replace(/\s(?:integrity|crossorigin)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
  }).replace(/\bdata-bob-api-base\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, `data-bob-api-base="${api.origin}"`)
    .replace(/<a\b[^>]*>/gi, tag => {
      const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
      if (!match) return tag;
      try {
        const url = new URL(match[1] || match[2] || match[3], origin);
        if (!['http://127.0.0.1:8769','https://outsideinprint.org','https://www.outsideinprint.org'].includes(url.origin)) return tag;
        return attribute(tag, 'href', origin + url.pathname + url.search + url.hash);
      } catch { return tag; }
    });
}
function target(base, relative) {
  const file = path.resolve(base, relative);
  if (!file.startsWith(path.resolve(base) + path.sep)) throw new Error('Invalid path.');
  return file;
}
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end('Method not allowed'); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
    if (pathname.split('/').some(part => part.startsWith('.') || part.includes('\\'))) throw new Error('Invalid path.');
    let file;
    if (pathname.startsWith('/__bob-source/js/')) file = target(path.join(root, 'assets/js'), pathname.slice('/__bob-source/js/'.length));
    else if (pathname.startsWith('/__bob-source/css/')) file = target(path.join(root, 'assets/css'), pathname.slice('/__bob-source/css/'.length));
    else if (pathname.startsWith('/companion-bob/runtime/')) file = target(path.join(root, 'static/companion-bob/runtime'), pathname.slice('/companion-bob/runtime/'.length) + (pathname.endsWith('/') ? 'index.html' : ''));
    else file = target(site, pathname.slice(1) + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream'});
    if (req.method === 'HEAD') { res.end(); return; }
    if (path.extname(file) === '.html') res.end(overlay(fs.readFileSync(file, 'utf8')));
    else fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({url:origin, api:api.origin, renderedSite:site, sourceRoot:root, deployment:false})));
