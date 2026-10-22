import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DeviceInfo, Sample } from './adapters/types.js';
import type { AlertConfig } from './alerts.js';

export const KEEP_DAYS = 30;
export const BASE = process.env.BATTERYLENS_HOME || path.join(os.homedir(), '.batterylens');
const DATA = path.join(BASE, 'data');
const LOGS = path.join(BASE, 'logs');
const DAY_FILE = /^(\d{4})-(\d{2})-(\d{2})\.(jsonl|log)$/;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local-date key, so "today" matches the user's wall clock. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ---------- config / device ----------

export interface Config { port?: number; lastPruneDate?: string; installed?: boolean; alerts?: Partial<AlertConfig>; lastWeekly?: string }

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(BASE, file), 'utf8')); } catch { return fallback; }
}
function writeJson(file: string, value: unknown) {
  fs.mkdirSync(BASE, { recursive: true });
  fs.writeFileSync(path.join(BASE, file), JSON.stringify(value, null, 2));
}

export const readConfig = () => readJson<Config>('config.json', {});
export const writeConfig = (patch: Partial<Config>) => writeJson('config.json', { ...readConfig(), ...patch });
export const readDevice = () => readJson<DeviceInfo | null>('device.json', null);

/** Saves fresh device info but keeps the first-seen date from the oldest record. */
export function saveDevice(d: DeviceInfo) {
  const prev = readDevice();
  if (prev?.battery.firstSeenDate) d.battery.firstSeenDate = prev.battery.firstSeenDate;
  writeJson('device.json', d);
  return d;
}

// ---------- samples ----------

export function appendSamples(samples: Sample[]) {
  fs.mkdirSync(DATA, { recursive: true });
  const byDay = new Map<string, string[]>();
  for (const s of samples) {
    const k = dayKey(new Date(s.ts));
    byDay.set(k, [...(byDay.get(k) ?? []), JSON.stringify(s)]);
  }
  for (const [k, lines] of byDay) fs.appendFileSync(path.join(DATA, `${k}.jsonl`), lines.join('\n') + '\n');
}

/** Reads samples in [from, to]. Never reads beyond the 30-day window, even if prune ran late. */
export function readSamples(from: number, to = Date.now()): Sample[] {
  if (!fs.existsSync(DATA)) return [];
  const floor = startOfDay(new Date(to - (KEEP_DAYS - 1) * 86_400_000)).getTime();
  const lo = Math.max(from, floor);
  const out: Sample[] = [];
  for (const f of fs.readdirSync(DATA).sort()) {
    const m = DAY_FILE.exec(f);
    if (!m || m[4] !== 'jsonl') continue;
    const day = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    if (day + 86_400_000 <= lo || day > to) continue;
    for (const line of fs.readFileSync(path.join(DATA, f), 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const s = JSON.parse(line) as Sample;
        if (s.ts >= lo && s.ts <= to) out.push(s);
      } catch { /* skip a torn line from a crash mid-write */ }
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function latestSample(): Sample | null {
  const s = readSamples(Date.now() - 2 * 86_400_000);
  return s[s.length - 1] ?? null;
}

// ---------- retention / clear / stats ----------

/** Keeps today + previous 29 days; deletes older day files in data/ and logs/. */
export function pruneOldData(now = new Date(), base = BASE) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (KEEP_DAYS - 1));
  let removed = 0;
  for (const dir of ['data', 'logs']) {
    const full = path.join(base, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      const m = DAY_FILE.exec(f);
      if (!m) continue; // never touch unknown files
      if (new Date(+m[1], +m[2] - 1, +m[3]) < cutoff) { fs.rmSync(path.join(full, f), { force: true }); removed++; }
    }
  }
  return removed;
}

/** Runs prune at most once per local day. */
export function pruneIfNewDay(now = new Date()) {
  const today = dayKey(now);
  if (readConfig().lastPruneDate === today) return;
  pruneOldData(now);
  writeConfig({ lastPruneDate: today });
}

export function dataStats() {
  let bytes = 0, samples = 0;
  const days: string[] = [];
  if (fs.existsSync(DATA)) {
    for (const f of fs.readdirSync(DATA).sort()) {
      const m = DAY_FILE.exec(f);
      if (!m || m[4] !== 'jsonl') continue;
      const content = fs.readFileSync(path.join(DATA, f), 'utf8');
      bytes += Buffer.byteLength(content);
      samples += content.split('\n').filter(Boolean).length;
      days.push(f.slice(0, 10));
    }
  }
  return { days: days.length, oldest: days[0] ?? null, newest: days.at(-1) ?? null, sizeMB: +(bytes / 1048576).toFixed(2), samples };
}

/** Deletes all samples and logs; keeps config so the collector keeps running. */
export function clearAll() {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.rmSync(LOGS, { recursive: true, force: true });
  const d = readDevice();
  if (d) { d.battery.firstSeenDate = new Date().toISOString(); writeJson('device.json', d); }
}

export function log(msg: string) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(path.join(LOGS, `${dayKey(new Date())}.log`), `${new Date().toISOString()} ${msg}\n`);
}
