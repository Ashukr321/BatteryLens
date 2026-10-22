import type { Sample } from './adapters/types.js';
import { dayKey } from './store.js';

/** Gap above this means the laptop was asleep or off. */
export const SLEEP_GAP = 3 * 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type Range = '24h' | '7d' | '14d' | '30d' | 'month' | 'day';

/**
 * Resolves a range to [from, to]. "month" is a calendar month (`at` = YYYY-MM, default current);
 * "day" is one local day (`at` = YYYY-MM-DD, default today).
 */
export function resolveRange(range: string, at?: string, now = Date.now()): { from: number; to: number; range: Range } {
  const n = new Date(now);
  const midnight = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  switch (range) {
    case '24h': return { from: now - DAY, to: now, range };
    case '7d': case '14d': case '30d': {
      const days = parseInt(range, 10);
      return { from: midnight - (days - 1) * DAY, to: now, range };
    }
    case 'month': {
      const [y, m] = (at && /^\d{4}-\d{2}$/.test(at) ? at : dayKey(n).slice(0, 7)).split('-').map(Number);
      return { from: new Date(y, m - 1, 1).getTime(), to: Math.min(now, new Date(y, m, 1).getTime() - 1), range };
    }
    case 'day': {
      const [y, m, d] = (at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : dayKey(n)).split('-').map(Number);
      return { from: new Date(y, m - 1, d).getTime(), to: Math.min(now, new Date(y, m - 1, d + 1).getTime() - 1), range };
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
  const hourly = to - from <= DAY + HOUR; // + HOUR: a 25h DST day is still one day
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

const bucketKey = (ts: number, hourly: boolean) => {
  const d = new Date(ts);
  return hourly ? `${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}:00` : dayKey(d);
};

export function health(samples: Sample[], designCapacity: number, hourly: boolean) {
  const groups = new Map<string, number[]>();
  const temps = new Map<string, number[]>();
  for (const s of samples) {
    const k = bucketKey(s.ts, hourly);
    if (s.temperatureC != null) temps.set(k, [...(temps.get(k) ?? []), s.temperatureC]);
    if (s.fullChargeCapacity) groups.set(k, [...(groups.get(k) ?? []), s.fullChargeCapacity]);
  }
  const series = [...groups].map(([key, caps]) => {
    const fullChargeCapacity = Math.round(caps.reduce((a, b) => a + b, 0) / caps.length);
    return { key, fullChargeCapacity, designCapacity, health: designCapacity ? +((fullChargeCapacity / designCapacity) * 100).toFixed(1) : null };
  });
  const latest = [...samples].reverse().find((s) => s.fullChargeCapacity)?.fullChargeCapacity;
  const current = latest && designCapacity ? +((latest / designCapacity) * 100).toFixed(1) : null;
  // Empty on most Windows laptops: they don't expose battery temperature.
  const temperature = [...temps].map(([key, t]) => ({ key, avg: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1), max: Math.max(...t) }));
  return { current, fullChargeCapacity: latest ?? null, designCapacity, series, temperature, forecast: hourly ? null : forecast(series) };
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

// ---------- habits ----------

export const HOT_C = 40;

/**
 * 0–100 score from three wear factors: time held at 100% on the charger (up to -40),
 * deep discharges to <= 10% (up to -30), and time above 40°C (up to -30).
 */
export function habits(samples: Sample[]) {
  let active = 0, plugged = 0, pluggedFull = 0, withTemp = 0, hot = 0, deep = 0;
  let armed = true; // one deep discharge per dip; re-arms after climbing above 20%
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.percent <= 10 && armed) { deep++; armed = false; } else if (s.percent > 20) armed = true;
    const gap = i + 1 < samples.length ? samples[i + 1].ts - s.ts : 0;
    if (gap <= 0 || gap > SLEEP_GAP) continue;
    active += gap;
    if (s.acConnected) { plugged += gap; if (s.percent >= 99) pluggedFull += gap; }
    if (s.temperatureC != null) { withTemp += gap; if (s.temperatureC >= HOT_C) hot += gap; }
  }
  if (active < HOUR) return { score: null, fullWhilePluggedPct: null, deepDischarges: deep, hotPct: null, tips: [] as string[] };

  const fullShare = plugged ? pluggedFull / plugged : 0;
  const weeks = Math.max(1, (samples.at(-1)!.ts - samples[0].ts) / (7 * DAY));
  const hotShare = withTemp ? hot / withTemp : 0;
  const score = Math.round(100 - 40 * fullShare - Math.min(30, (deep / weeks) * 10) - 30 * Math.min(1, hotShare * 3));

  const tips: string[] = [];
  if (fullShare > 0.3) tips.push("Unplug around 80%, or turn on your laptop's battery-saver / charge limit mode.");
  if (deep / weeks >= 1) tips.push('Plug in before the battery drops below 20%; deep discharges wear it faster.');
  if (hotShare > 0.1) tips.push('The battery often runs hot. Keep vents clear and avoid charging on soft surfaces.');
  if (!tips.length) tips.push('Great habits. Keep charging between 20% and 80% when you can.');
  return {
    score: Math.max(0, score),
    fullWhilePluggedPct: Math.round(fullShare * 100),
    deepDischarges: deep,
    hotPct: withTemp ? Math.round(hotShare * 100) : null,
    tips,
  };
}

// ---------- sleep drain ----------

/** %/hour lost while asleep above which we warn (modern standby is usually ~0.5–1%/h). */
export const DRAIN_ALERT = 1.5;

/** Drain across one sleep/off gap between two samples, or null if it isn't one on battery. */
export function drainBetween(a: Sample, b: Sample) {
  const gap = b.ts - a.ts;
  if (gap <= SLEEP_GAP || a.acConnected || b.acConnected || gap < HOUR / 2) return null;
  const hours = gap / HOUR, lost = a.percent - b.percent;
  if (lost < 0) return null; // gained charge: it was plugged in for part of the gap
  const ratePerHour = +(lost / hours).toFixed(2);
  return { start: a.ts, end: b.ts, hours: +hours.toFixed(1), lost, ratePerHour, abnormal: lost >= 3 && ratePerHour > DRAIN_ALERT };
}

export function sleepDrain(samples: Sample[]) {
  const events = [];
  for (let i = 1; i < samples.length; i++) {
    const e = drainBetween(samples[i - 1], samples[i]);
    if (e) events.push(e);
  }
  const hours = events.reduce((a, e) => a + e.hours, 0);
  const lost = events.reduce((a, e) => a + e.lost, 0);
  return {
    avgPerHour: hours ? +(lost / hours).toFixed(2) : null,
    abnormal: events.filter((e) => e.abnormal).length,
    threshold: DRAIN_ALERT,
    events: events.reverse(),
  };
}

// ---------- weekly summary ----------

/** One-line recap of the 7 days before `now`, for the Monday notification. */
export function weeklySummary(samples: Sample[], designCapacity: number, now = Date.now()) {
  const from = now - 7 * DAY;
  const week = samples.filter((s) => s.ts >= from && s.ts <= now);
  const u = usage(week, from, now).totals;
  const c = cycles(week);
  const h = health(week, designCapacity, false).current;
  const fmt = (x: number) => `${Math.floor(x)}h${String(Math.round((x % 1) * 60)).padStart(2, '0')}m`;
  return `Last 7 days: ${fmt(u.plugged)} on charger, ${fmt(u.battery)} on battery, ${c.fullCharges} full charges${h != null ? `, health ${h}%` : ''}.`;
}

// ---------- anomalies ----------

/** Day-over-day full-charge capacity drop (%) worth flagging; normal wear is ~0.05%/day. */
export const CAPACITY_DROP = 3;
/** A day's active drain this many times the usual (median) rate is flagged. */
export const DRAIN_FACTOR = 2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Sudden capacity drops and days with unusually fast drain while in use on battery. */
export function anomalies(samples: Sample[]) {
  const caps = new Map<string, number[]>();
  const drain = new Map<string, { lost: number; ms: number }>();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], k = dayKey(new Date(s.ts));
    if (s.fullChargeCapacity) caps.set(k, [...(caps.get(k) ?? []), s.fullChargeCapacity]);
    const n = samples[i + 1], gap = n ? n.ts - s.ts : 0;
    if (!n || gap <= 0 || gap > SLEEP_GAP || s.acConnected || n.acConnected) continue;
    const d = drain.get(k) ?? { lost: 0, ms: 0 };
    d.lost += Math.max(0, s.percent - n.percent);
    d.ms += gap;
    drain.set(k, d);
  }

  const out: { type: 'capacity' | 'drain'; day: string; value: number; baseline: number }[] = [];
  const days = [...caps].map(([day, c]) => ({ day, cap: median(c) }));
  for (let i = 1; i < days.length; i++) {
    const drop = ((days[i - 1].cap - days[i].cap) / days[i - 1].cap) * 100;
    if (drop >= CAPACITY_DROP) out.push({ type: 'capacity', day: days[i].day, value: Math.round(days[i].cap), baseline: Math.round(days[i - 1].cap) });
  }

  // Only days with 30+ min on battery have a meaningful rate.
  const rates = [...drain].filter(([, d]) => d.ms >= HOUR / 2).map(([day, d]) => ({ day, rate: d.lost / (d.ms / HOUR) }));
  if (rates.length >= 3) {
    const usual = median(rates.map((r) => r.rate));
    for (const r of rates) if (usual > 0 && r.rate >= usual * DRAIN_FACTOR) out.push({ type: 'drain', day: r.day, value: +r.rate.toFixed(1), baseline: +usual.toFixed(1) });
  }
  return { anomalies: out.sort((a, b) => b.day.localeCompare(a.day)) };
}
