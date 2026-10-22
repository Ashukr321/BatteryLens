import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Adapter } from './adapters/types.js';
import { clearAll, dataStats, latestSample, readDevice, readSamples } from './store.js';
import { cycles, health, resolveRange, usage } from './analytics.js';

const STATIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dashboard');
const DEV = !!process.env.BATTERYLENS_DEV;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const CSV_COLS = ['ts', 'percent', 'acConnected', 'charging', 'fullChargeCapacity', 'cycleCount', 'temperatureC', 'voltageMv', 'adapterWatts'] as const;

export function toCsv(samples: Record<string, unknown>[]) {
  return [['time', ...CSV_COLS].join(','), ...samples.map((s) => [new Date(s.ts as number).toISOString(), ...CSV_COLS.map((c) => s[c] ?? '')].join(','))].join('\n');
}

export function createServer(adapter: Adapter, port: number) {
  // Clear requests must carry this token; only our own HTML gets it, so other sites can't clear data.
  const token = DEV ? 'dev' : crypto.randomUUID();
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(DEV ? ['http://localhost:3000'] : [])]);

  const api = async (url: URL, req: http.IncomingMessage): Promise<[number, unknown, string?]> => {
    const q = url.searchParams;
    const device = readDevice();
    const design = device?.battery.designCapacity ?? 0;
    switch (url.pathname) {
      case '/api/device': return [200, device];
      case '/api/live': return [200, (await adapter.sample().catch(() => null)) ?? latestSample()];
      case '/api/usage': {
        const r = resolveRange(q.get('range') ?? '24h', q.get('month') ?? undefined);
        // Include a few minutes before "from" so the first gap is attributed.
        return [200, { range: r.range, ...usage(readSamples(r.from - 5 * 60_000, r.to), r.from, r.to) }];
      }
      case '/api/health': {
        const r = resolveRange(q.get('range') ?? '30d', q.get('month') ?? undefined);
        return [200, { range: r.range, ...health(readSamples(r.from, r.to), design, r.range === '24h') }];
      }
      case '/api/cycles': {
        const r = resolveRange(q.get('range') ?? '30d', q.get('month') ?? undefined);
        return [200, { range: r.range, ...cycles(readSamples(r.from, r.to), device?.battery.designCycleCount) }];
      }
      case '/api/samples': {
        const s = readSamples(Number(q.get('from')) || 0, Number(q.get('to')) || Date.now());
        return q.get('format') === 'csv' ? [200, toCsv(s as any), 'text/csv'] : [200, s];
      }
      case '/api/data/stats': return [200, dataStats()];
      case '/api/data/clear': {
        if (req.method !== 'POST') return [405, { error: 'POST only' }];
        if (!origins.has(req.headers.origin ?? '')) return [403, { error: 'Bad origin' }];
        const body = await readBody(req);
        if (body?.token !== token) return [403, { error: 'Bad token' }];
        if (body?.confirm !== 'DELETE') return [400, { error: 'Type DELETE to confirm' }];
        clearAll();
        return [200, { ok: true }];
      }
      default: return [404, { error: 'Not found' }];
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const [status, body, type] = await api(url, req);
        res.writeHead(status, { 'content-type': type ?? 'application/json', 'cache-control': 'no-store' });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
        return;
      }
      serveStatic(url.pathname, token, res);
    } catch (e: any) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  return { server, token };
}

function serveStatic(pathname: string, token: string, res: http.ServerResponse) {
  // Next static export uses trailingSlash: /usage/ -> usage/index.html
  let file = path.normalize(path.join(STATIC, decodeURIComponent(pathname)));
  if (file !== STATIC && !file.startsWith(STATIC + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = segmentFile(file) ?? path.join(STATIC, '404.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Dashboard not built. Run `npm run build`.');
    return;
  }
  const ext = path.extname(file);
  let body: string | Buffer = fs.readFileSync(file);
  if (ext === '.html') body = body.toString().replace('</head>', `<script>window.__BL_TOKEN__=${JSON.stringify(token)}</script></head>`);
  // Hashed build assets never change; pages and route data must revalidate or upgrades show stale UI.
  const cache = pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(file.endsWith('404.html') ? 404 : 200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache });
  res.end(body);
}

/** Next's router asks for `__next.usage.__PAGE__.txt` but the export writes `__next.usage/__PAGE__.txt`. */
function segmentFile(file: string) {
  const name = path.basename(file);
  if (!name.startsWith('__next.') || !name.endsWith('.txt')) return undefined;
  const parts = name.slice('__next.'.length, -'.txt'.length).split('.');
  for (let i = 1; i < parts.length; i++) {
    const candidate = path.join(path.dirname(file), `__next.${parts.slice(0, i).join('.')}`, ...parts.slice(i, -1), `${parts.at(-1)}.txt`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  });
}

/** Binds 127.0.0.1 only; tries the next ports if the preferred one is busy. */
export async function listen(adapter: Adapter, preferred: number) {
  for (let port = preferred; port < preferred + 20; port++) {
    const { server, token } = createServer(adapter, port);
    const ok = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (ok) return { server, port, token };
  }
  throw new Error(`No free port in ${preferred}-${preferred + 19}`);
}
