import type { Sample } from './adapters/types.js';
import { dayKey } from './store.js';

/** Gap above this means the laptop was asleep or off. */
export const SLEEP_GAP = 3 * 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type Range = '24h' | '7d' | '14d' | '30d' | 'month';

/** Resolves a range to [from, to]. "month" is a calendar month (YYYY-MM), default current. */
export function resolveRange(range: string, month?: string, now = Date.now()): { from: number; to: number; range: Range } {
  const n = new Date(now);
  const midnight = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  switch (range) {
    case '24h': return { from: now - DAY, to: now, range };
    case '7d': case '14d': case '30d': {
      const days = parseInt(range, 10);
      return { from: midnight - (days - 1) * DAY, to: now, range };
    }
    case 'month': {
      const [y, m] = (month && /^\d{4}-\d{2}$/.test(month) ? month : dayKey(n).slice(0, 7)).split('-').map(Number);
      return { from: new Date(y, m - 1, 1).getTime(), to: Math.min(now, new Date(y, m, 1).getTime() - 1), range };
    }
    default: throw new Error(`Unknown range "${range}"`);
  }
}

// ---------- usage ----------

export interface UsageBucket { key: string; start: number; plugged: number; battery: number; off: number }

/** Bucket boundaries in local time: hours for 24h, days otherwise. */
function buckets(from: number, to: number, hourly: boolean): UsageBucket[] {
  const out: UsageBucket[] = [];
  const d = new Date(from);
  let t = hourly ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime()
                 : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  while (t <= to) {
    const s = new Date(t);
    out.push({ key: hourly ? `${dayKey(s)} ${String(s.getHours()).padStart(2, '0')}:00` : dayKey(s), start: t, plugged: 0, battery: 0, off: 0 });
    // Next local hour/day; using Date setters keeps DST days at 23/25h.
    t = hourly ? t + HOUR : new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1).getTime();
  }
  return out;
}

export function usage(samples: Sample[], from: number, to: number) {
  const hourly = to - from <= DAY;
  const bs = buckets(from, to, hourly);
  const find = (ts: number) => {
    for (let i = bs.length - 1; i >= 0; i--) if (bs[i].start <= ts) return bs[i];
    return undefined;
  };
  let plugged = 0, battery = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], gap = samples[i].ts - a.ts;
    if (gap <= 0 || gap > SLEEP_GAP || a.ts < from) continue;
    const b = find(a.ts);
    if (a.acConnected) { plugged += gap; if (b) b.plugged += gap; } else { battery += gap; if (b) b.battery += gap; }
  }
  const h = (ms: number) => +(ms / HOUR).toFixed(2);
  const rows = bs.map((b, i) => {
    const end = Math.min(to, i + 1 < bs.length ? bs[i + 1].start : to);
    const span = Math.max(0, end - Math.max(b.start, from));
    return { key: b.key, plugged: h(b.plugged), battery: h(b.battery), off: h(Math.max(0, span - b.plugged - b.battery)) };
  });
  return {
    from, to, bucket: hourly ? 'hour' : 'day',
    totals: { plugged: h(plugged), battery: h(battery), off: h(Math.max(0, to - from - plugged - battery)) },
    rows,
  };
}

// ---------- cycles ----------

export interface ChargeSession { start: number; end: number; startPercent: number; endPercent: number; minutes: number; ratePerHour: number }

export function cycles(samples: Sample[], designCycleCount?: number) {
  let fullCharges = 0, discharged = 0;
  let armed = true; // hysteresis: count a full charge only after dropping below 95 again
  const perDay = new Map<string, number>();
  const sessions: ChargeSession[] = [];
  let open: Sample | null = null, last: Sample | null = null;

  const close = (end: Sample) => {
    if (!open) return;
    const minutes = Math.round((end.ts - open.ts) / 60_000);
    if (minutes >= 1) {
      const gained = end.percent - open.percent;
      sessions.push({ start: open.ts, end: end.ts, startPercent: open.percent, endPercent: end.percent, minutes, ratePerHour: +((gained / minutes) * 60).toFixed(1) });
    }
    open = null;
  };

  for (const s of samples) {
    if (s.percent >= 99 && armed) {
      fullCharges++; armed = false;
      const k = dayKey(new Date(s.ts));
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    } else if (s.percent < 95) armed = true;

    if (last && s.percent < last.percent) discharged += last.percent - s.percent;

    // A long gap ends a session: we don't know when the charger was pulled.
    if (open && last && s.ts - last.ts > SLEEP_GAP) close(last);
    if (s.acConnected && !open) open = s;
    if (!s.acConnected && open) close(s);
    last = s;
  }
  if (last) close(last);

  const osCount = [...samples].reverse().find((s) => s.cycleCount)?.cycleCount;
  const design = designCycleCount ?? 500;
  return {
    osCycleCount: osCount ?? null,
    designCycleCount: design,
    designCycleAssumed: designCycleCount == null,
    cycleLifeUsed: osCount ? +((osCount / design) * 100).toFixed(1) : null,
    fullCharges,
    equivalentCycles: +(discharged / 100).toFixed(2),
    fullChargesPerDay: [...perDay].map(([day, count]) => ({ day, count })),
    sessions: sessions.reverse(),
  };
}

// ---------- health ----------

export function health(samples: Sample[], designCapacity: number, hourly: boolean) {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    if (!s.fullChargeCapacity) continue;
    const d = new Date(s.ts);
    const k = hourly ? `${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}:00` : dayKey(d);
    groups.set(k, [...(groups.get(k) ?? []), s.fullChargeCapacity]);
  }
  const series = [...groups].map(([key, caps]) => {
    const fullChargeCapacity = Math.round(caps.reduce((a, b) => a + b, 0) / caps.length);
    return { key, fullChargeCapacity, designCapacity, health: designCapacity ? +((fullChargeCapacity / designCapacity) * 100).toFixed(1) : null };
  });
  const latest = [...samples].reverse().find((s) => s.fullChargeCapacity)?.fullChargeCapacity;
  const current = latest && designCapacity ? +((latest / designCapacity) * 100).toFixed(1) : null;
  return { current, fullChargeCapacity: latest ?? null, designCapacity, series, forecast: hourly ? null : forecast(series) };
}

/** Least-squares line over daily health; returns when it should hit 80%. */
export function forecast(series: { key: string; health: number | null }[]) {
  const pts = series.filter((p) => p.health != null).map((p) => ({ x: Date.parse(p.key) / DAY, y: p.health! }));
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (!den) return null;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den; // % per day
  const intercept = my - slope * mx;
  const target = 80;
  const lastY = pts[n - 1].y;
  if (slope >= 0) return { slopePerMonth: +(slope * 30).toFixed(2), reach80: null, note: 'Stable or improving — no decline detected.' };
  if (lastY <= target) return { slopePerMonth: +(slope * 30).toFixed(2), reach80: null, note: 'Already below 80% — consider a replacement.' };
  const x80 = (target - intercept) / slope;
  return { slopePerMonth: +(slope * 30).toFixed(2), reach80: new Date(x80 * DAY).toISOString().slice(0, 10), note: null };
}
