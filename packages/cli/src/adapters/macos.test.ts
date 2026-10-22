import test from 'node:test';
import assert from 'node:assert/strict';
import * as plist from 'plist';
import { parseBattery, pmsetToSamples } from './macos.js';

// Trimmed `ioreg -arn AppleSmartBattery` output; only the keys the adapter reads.
const ioreg = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><array><dict>${body}</dict></array></plist>`;

// Intel MacBook Pro: capacities in mAh.
const INTEL = ioreg(`
  <key>CurrentCapacity</key><integer>3600</integer>
  <key>MaxCapacity</key><integer>4500</integer>
  <key>DesignCapacity</key><integer>5100</integer>
  <key>CycleCount</key><integer>312</integer>
  <key>Temperature</key><integer>3050</integer>
  <key>Voltage</key><integer>12500</integer>
  <key>ExternalConnected</key><true/>
  <key>IsCharging</key><true/>
  <key>AdapterDetails</key><dict><key>Watts</key><integer>61</integer></dict>`);

// Apple Silicon: Current/MaxCapacity are percent; mAh lives in AppleRaw*.
const APPLE_SILICON = ioreg(`
  <key>CurrentCapacity</key><integer>76</integer>
  <key>MaxCapacity</key><integer>100</integer>
  <key>AppleRawCurrentCapacity</key><integer>3190</integer>
  <key>AppleRawMaxCapacity</key><integer>4200</integer>
  <key>DesignCapacity</key><integer>4382</integer>
  <key>CycleCount</key><integer>87</integer>
  <key>Temperature</key><integer>2980</integer>
  <key>Voltage</key><integer>12100</integer>
  <key>ExternalConnected</key><false/>
  <key>IsCharging</key><false/>`);

const first = (xml: string) => (plist.parse(xml) as any[])[0];

test('macOS Intel ioreg: percent from mAh, temperature, adapter watts', () => {
  const s = parseBattery(first(INTEL));
  assert.equal(s.percent, 80);
  assert.equal(s.fullChargeCapacity, 4500);
  assert.equal(s.temperatureC, 30.5);
  assert.equal(s.adapterWatts, 61);
  assert.ok(s.acConnected && s.charging);
});

test('macOS Apple Silicon ioreg: percent as reported, raw mAh capacity', () => {
  const s = parseBattery(first(APPLE_SILICON));
  assert.equal(s.percent, 76);
  assert.equal(s.fullChargeCapacity, 4200);
  assert.equal(s.cycleCount, 87);
  assert.equal(s.adapterWatts, undefined);
  assert.ok(!s.acConnected && !s.charging);
});

test('pmset log: power-source switches become minute samples, capped at 12h', () => {
  const log = [
    '2026-10-20 09:00:00 +0530 Wake                \tWake from Deep Idle [CDNVA] : due to SMC.OutboxNotEmpty Using AC (Charge:80%) 2 secs',
    '2026-10-20 09:10:00 +0530 Assertions          \tPID 123(WindowServer) Created UserIsActive',
    '2026-10-20 09:30:00 +0530 Sleep               \tEntering Sleep state due to \'Software Sleep\': Using Batt (Charge:79%) 5 secs',
  ].join('\n');
  const out = pmsetToSamples(log);
  assert.equal(out.filter((s) => s.acConnected).length, 30);
  assert.equal(out[0].percent, 80);
  assert.equal(out[30].percent, 79);
  assert.equal(out.length, 30 + 12 * 60);
});
