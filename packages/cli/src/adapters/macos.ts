import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import * as plist from 'plist';
import type { Activity, Adapter, DeviceInfo, Sample } from './types.js';

const run = promisify(execFile);

async function ioreg(): Promise<any | null> {
  const { stdout } = await run('ioreg', ['-arn', 'AppleSmartBattery']);
  if (!stdout.trim()) return null;
  const parsed = plist.parse(stdout) as any[];
  return parsed?.[0] ?? null;
}

/** Apple Silicon reports Current/MaxCapacity as percent; raw mAh lives in AppleRaw* keys. */
export function parseBattery(b: any): Sample {
  const rawMax = b.AppleRawMaxCapacity ?? b.MaxCapacity;
  // Use what the menu bar shows: CurrentCapacity is already a percent when MaxCapacity is 100.
  const percent = b.MaxCapacity > 100 ? Math.round((b.CurrentCapacity / b.MaxCapacity) * 100) : b.CurrentCapacity;
  return {
    ts: Date.now(),
    percent: Math.max(0, Math.min(100, percent)),
    acConnected: !!b.ExternalConnected,
    charging: !!b.IsCharging,
    fullChargeCapacity: rawMax,
    cycleCount: b.CycleCount,
    temperatureC: b.Temperature != null ? b.Temperature / 100 : undefined,
    voltageMv: b.Voltage,
    adapterWatts: b.AdapterDetails?.Watts,
  };
}

/** Parses `pmset -g log` power source switches. Exported for tests. */
export function pmsetToSamples(log: string): Sample[] {
  const events: { t: number; ac: boolean; pct?: number }[] = [];
  for (const line of log.split('\n')) {
    const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}).*Using (AC|Batt)(?:.*?Charge: ?(\d+)%)?/.exec(line);
    if (!m) continue;
    const t = Date.parse(m[1].replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!isNaN(t)) events.push({ t, ac: m[2] === 'AC', pct: m[3] ? +m[3] : undefined });
  }
  const out: Sample[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const end = events[i + 1]?.t ?? Date.now();
    // Cap a single segment at 12h; longer stretches are almost certainly sleep.
    const stop = Math.min(end, e.t + 12 * 3600_000);
    for (let t = e.t; t < stop; t += 60_000) {
      out.push({ ts: t, percent: e.pct ?? 0, acConnected: e.ac, charging: false });
    }
  }
  return out;
}

/** Parses the last sample block of `top -l 2 -stats command,power` (the first block's power is always 0). */
export function parseTopPower(out: string): Record<string, number> | undefined {
  const lines = out.split('\n');
  let start = -1;
  lines.forEach((l, i) => { if (/^\s*COMMAND\s+POWER\b/.test(l)) start = i; });
  const apps: Record<string, number> = {};
  for (const l of start < 0 ? [] : lines.slice(start + 1)) {
    const m = /^(.*?)\s+([\d.]+)\s*$/.exec(l);
    if (m && +m[2] > 0) apps[m[1].trim()] = +((apps[m[1].trim()] ?? 0) + +m[2]).toFixed(1);
  }
  return Object.keys(apps).length ? apps : undefined;
}

/** Screen on = HID idle time below pmset's displaysleep (minutes, 0 = never) for the current power source. */
export function macScreenOn(ioregIdle: string, pmset: string) {
  const idleNs = Number(/"HIDIdleTime" = (\d+)/.exec(ioregIdle)?.[1]);
  const sleepMin = Number(/displaysleep\s+(\d+)/.exec(pmset)?.[1]);
  if (isNaN(idleNs)) return undefined;
  return !sleepMin || idleNs / 1e9 < sleepMin * 60;
}

export function macosAdapter(): Adapter {
  return {
    async device(): Promise<DeviceInfo | null> {
      const b = await ioreg();
      if (!b) return null;
      const hw = await run('system_profiler', ['SPHardwareDataType', '-json'])
        .then((r) => JSON.parse(r.stdout).SPHardwareDataType?.[0] ?? {}).catch(() => ({}));
      const name = await run('scutil', ['--get', 'ComputerName']).then((r) => r.stdout.trim()).catch(() => os.hostname());
      const ver = await run('sw_vers', ['-productVersion']).then((r) => r.stdout.trim()).catch(() => os.release());
      return {
        userName: os.userInfo().username,
        computerName: name,
        laptopModel: [hw.machine_name, hw.machine_model].filter(Boolean).join(' ') || 'Mac',
        laptopManufacturer: 'Apple',
        os: `macOS ${ver}`,
        battery: {
          manufacturer: b.Manufacturer || undefined,
          model: b.DeviceName || undefined,
          serial: b.BatterySerialNumber || b.Serial || undefined,
          // ManufactureDate encoding varies by model; firstSeenDate is the fallback.
          firstSeenDate: new Date().toISOString(),
          designCapacity: b.DesignCapacity ?? 0,
          capacityUnit: 'mAh',
          designCycleCount: b.DesignCycleCount9C ?? 1000,
        },
      };
    },

    async sample() {
      const b = await ioreg();
      return b ? parseBattery(b) : null;
    },

    async activity(): Promise<Activity> {
      const out = (cmd: string, args: string[]) => run(cmd, args).then((r) => r.stdout).catch(() => '');
      const [idle, pm, top] = await Promise.all([
        out('ioreg', ['-c', 'IOHIDSystem', '-d', '4', '-k', 'HIDIdleTime']),
        out('pmset', ['-g']),
        out('top', ['-l', '2', '-s', '1', '-stats', 'command,power', '-o', 'power', '-n', '8']),
      ]);
      return { screenOn: macScreenOn(idle, pm), apps: parseTopPower(top) };
    },

    async history() {
      const { stdout } = await run('pmset', ['-g', 'log'], { maxBuffer: 64 * 1024 * 1024 }).catch(() => ({ stdout: '' }));
      return pmsetToSamples(stdout);
    },
  };
}
