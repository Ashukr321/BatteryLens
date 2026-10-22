import fs from 'node:fs';
import path from 'node:path';
import { getAdapter, type Adapter, type Sample } from './adapters/index.js';
import { BASE, appendSamples, dataStats, dayKey, latestSample, log, pruneIfNewDay, readConfig, readDevice, readSamples, saveDevice, writeConfig } from './store.js';
import { DEFAULT_ALERTS, alertsFor, notify, parseAlerts } from './alerts.js';
import { weeklySummary } from './analytics.js';

const LOCK = path.join(BASE, 'collector.lock');
const DEVICE_REFRESH = 6 * 3_600_000;

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export function collectorPid(): number | null {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    return pid && alive(pid) ? pid : null;
  } catch { return null; }
}

/** Imports OS history once, so a fresh install doesn't show an empty dashboard. */
export async function bootstrap(adapter: Adapter) {
  if (!readDevice()) {
    const d = await adapter.device();
    if (!d) throw new Error('No battery found on this machine.');
    saveDevice(d);
  }
  if (dataStats().samples > 0) return 0;
  const hist = await adapter.history().catch((e) => { log(`history import failed: ${e.message}`); return []; });
  appendSamples(hist);
  return hist.length;
}

/**
 * The 60s sampling loop. Returns a stop function.
 * Single-instance via a pid lock file; returns null if another collector is running.
 */
export async function startCollector(adapter = getAdapter()): Promise<(() => void) | null> {
  if (collectorPid() && collectorPid() !== process.pid) return null;
  fs.mkdirSync(BASE, { recursive: true });
  fs.writeFileSync(LOCK, String(process.pid));

  await bootstrap(adapter);
  pruneIfNewDay();
  let lastDevice = Date.now();
  // The last stored sample, so a wake after sleep (or a restart) still sees the drain across the gap.
  let prev = latestSample();

  const tick = async () => {
    try {
      pruneIfNewDay(); // catches midnight even if the laptop slept through it
      const s = await adapter.sample();
      if (s) {
        appendSamples([s]);
        checkAlerts(prev, s);
        prev = s;
      }
      if (Date.now() - lastDevice > DEVICE_REFRESH) {
        lastDevice = Date.now();
        const d = await adapter.device();
        if (d) saveDevice(d);
      }
    } catch (e: any) {
      log(`tick failed: ${e.message}`);
    }
  };
  await tick();
  const timer = setInterval(tick, 60_000);

  const stop = () => {
    clearInterval(timer);
    adapter.close?.();
    if (collectorPid() === process.pid) fs.rmSync(LOCK, { force: true });
  };
  process.once('exit', stop);
  return stop;
}

function checkAlerts(prev: Sample | null, cur: Sample) {
  // A hand-edited config with bad values falls back to defaults instead of silencing alerts forever.
  const cfg = (() => { try { return parseAlerts(readConfig().alerts); } catch { return DEFAULT_ALERTS; } })();
  for (const msg of alertsFor(prev, cur, cfg)) notify('BatteryLens', msg);

  const now = new Date();
  if (cfg.enabled && cfg.weekly && now.getDay() === 1 && readConfig().lastWeekly !== dayKey(now)) {
    writeConfig({ lastWeekly: dayKey(now) });
    notify('BatteryLens: your week', weeklySummary(readSamples(now.getTime() - 7 * 86_400_000), readDevice()?.battery.designCapacity ?? 0));
  }
}
