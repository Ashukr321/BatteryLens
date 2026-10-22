import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anomalies, cycles, habits, resolveRange, sleepDrain, usage, weeklySummary } from './analytics.js';
import { DEFAULT_ALERTS, alertsFor, parseAlerts } from './alerts.js';
import { pruneOldData } from './store.js';
import { livePercent, usageToSamples } from './adapters/windows.js';
import type { Sample } from './adapters/types.js';

const MIN = 60_000;
const s = (min: number, percent: number, ac: boolean): Sample => ({ ts: Date.UTC(2026, 9, 22, 6) + min * MIN, percent, acConnected: ac, charging: ac });

test('usage splits plugged/battery and treats long gaps as sleep', () => {
  const samples = [s(0, 50, true), s(1, 51, true), s(2, 52, false), s(3, 51, false), s(60, 40, false), s(61, 39, false)];
  const t = usage(samples, samples[0].ts, samples.at(-1)!.ts).totals;
  assert.equal(t.plugged, +(2 / 60).toFixed(2));
  assert.equal(t.battery, +(2 / 60).toFixed(2));
});

test('full charges use hysteresis and equivalent cycles sum discharge', () => {
  const samples = [s(0, 98, true), s(1, 99, true), s(2, 100, true), s(3, 99, true), s(4, 50, false), s(5, 99, true)];
  const c = cycles(samples);
  assert.equal(c.fullCharges, 2);
  assert.equal(c.equivalentCycles, 0.5);
  assert.equal(c.sessions.length, 1); // the trailing 0-minute session is dropped
});

test('retention keeps exactly 30 day files', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-'));
  fs.mkdirSync(path.join(base, 'data'));
  const now = new Date(2026, 9, 22);
  for (let i = 0; i < 35; i++) {
    const d = new Date(2026, 9, 22 - i);
    fs.writeFileSync(path.join(base, 'data', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.jsonl`), '');
  }
  fs.writeFileSync(path.join(base, 'data', 'notes.txt'), 'keep');
  assert.equal(pruneOldData(now, base), 5);
  assert.equal(fs.readdirSync(path.join(base, 'data')).length, 31); // 30 days + the unknown file
  fs.rmSync(base, { recursive: true });
});

test('powercfg RecentUsage becomes minute samples; standby stays a gap', () => {
  const out = usageToSamples([
    { Timestamp: '2026-10-15T12:00:00Z', EntryType: 'Active', Ac: '0', ChargeCapacity: '40000', FullChargeCapacity: '40000' },
    { Timestamp: '2026-10-15T12:10:00Z', EntryType: 'ConnectedStandby', Ac: '0', ChargeCapacity: '36000', FullChargeCapacity: '40000' },
    { Timestamp: '2026-10-15T13:00:00Z', EntryType: 'Active', Ac: '1', ChargeCapacity: '35000', FullChargeCapacity: '40000' },
  ]);
  assert.equal(out.length, 10);
  assert.equal(out[0].percent, 100);
  assert.ok(out.every((x) => !x.acConnected));
});

test('live percent matches the Windows taskbar (rounded capacity ratio)', () => {
  assert.equal(livePercent({ percent: 86, remaining: 22438, full: 25900 }), 87);
  assert.equal(livePercent({ percent: 55 }), 55); // falls back when root/wmi isn't available
});

test('day range covers one local day; DST-length days still bucket hourly', () => {
  const r = resolveRange('day', '2026-10-20', Date.UTC(2026, 9, 22));
  assert.equal(r.from, new Date(2026, 9, 20).getTime());
  assert.equal(r.to, new Date(2026, 9, 21).getTime() - 1);
  assert.equal(usage([], r.from, r.from + 25 * 60 * MIN).bucket, 'hour');
});

test('habit score penalises time held at 100% on the charger and deep discharges', () => {
  const good = Array.from({ length: 120 }, (_, i) => s(i, 60 - Math.floor(i / 10), false));
  assert.equal(habits(good).score, 100);
  const bad = [...Array.from({ length: 120 }, (_, i) => s(i, 100, true)), s(121, 8, false), s(122, 8, false)];
  const h = habits(bad);
  assert.equal(h.deepDischarges, 1);
  assert.ok(h.score! <= 70, `score ${h.score}`);
  assert.equal(habits([s(0, 50, false), s(1, 50, false)]).score, null); // < 1h of data
});

test('sleep drain flags fast drain on battery only', () => {
  const d = sleepDrain([s(0, 80, false), s(120, 70, false), s(121, 70, false), s(600, 69, false), s(601, 69, true), s(900, 60, true)]);
  assert.equal(d.events.length, 2); // the plugged-in gap is skipped
  assert.equal(d.abnormal, 1);
  assert.equal(d.events[1].ratePerHour, 5);
  assert.equal(sleepDrain([s(0, 50, false), s(120, 60, false)]).events.length, 0); // charged during the gap
});

test('alerts fire once on threshold crossings and respect the switch', () => {
  const cfg = { ...DEFAULT_ALERTS };
  assert.equal(alertsFor(s(0, 79, true), s(1, 80, true), cfg).length, 1);
  assert.equal(alertsFor(s(0, 80, true), s(1, 81, true), cfg).length, 0);
  assert.equal(alertsFor(s(0, 21, false), s(1, 20, false), cfg).length, 1);
  assert.equal(alertsFor(s(0, 80, false), s(120, 70, false), cfg).length, 1); // 5%/h asleep
  assert.equal(alertsFor(s(0, 79, true), s(1, 80, true), { ...cfg, enabled: false }).length, 0);
});

test('alert settings are validated', () => {
  assert.deepEqual(parseAlerts({ high: 90 }), { ...DEFAULT_ALERTS, high: 90 });
  assert.throws(() => parseAlerts({ low: 90 }));
  assert.throws(() => parseAlerts({ hotC: '45' }));
  assert.throws(() => parseAlerts({ enabled: 'yes' }));
});

test('weekly summary reads the last 7 days', () => {
  const now = s(10, 0, false).ts;
  assert.match(weeklySummary([s(0, 50, true), s(1, 51, true), s(2, 50, false)], 0, now), /^Last 7 days: 0h02m on charger, 0h00m on battery, 0 full charges\.$/);
});

test('anomalies: sudden capacity drop and a day draining 2x faster than usual', () => {
  const DAY_MIN = 24 * 60;
  const day = (d: number, cap: number, perMin: number) =>
    Array.from({ length: 60 }, (_, m): Sample => ({ ...s(d * DAY_MIN + m, 90 - Math.floor(m * perMin), false), fullChargeCapacity: cap }));
  const a = anomalies([...day(0, 40000, 0.2), ...day(1, 39990, 0.2), ...day(2, 38000, 0.2), ...day(3, 37990, 0.6)]).anomalies;
  assert.deepEqual(a.map((x) => x.type).sort(), ['capacity', 'drain']);
  assert.equal(a.find((x) => x.type === 'capacity')!.value, 38000);
  assert.equal(anomalies(day(0, 40000, 0.2)).anomalies.length, 0);
});
