import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cycles, usage } from './analytics.js';
import { pruneOldData } from './store.js';
import { usageToSamples } from './adapters/windows.js';
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
