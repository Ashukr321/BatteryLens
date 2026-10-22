import { execFile } from 'node:child_process';
import type { Sample } from './adapters/types.js';
import { drainBetween } from './analytics.js';
import { log } from './store.js';

export interface AlertConfig {
  enabled: boolean;
  /** Notify when charging reaches this %. */
  high: number;
  /** Notify when on battery and dropping to this %. */
  low: number;
  hotC: number;
  /** Monday recap of the previous week. */
  weekly: boolean;
}

export const DEFAULT_ALERTS: AlertConfig = { enabled: true, high: 80, low: 20, hotC: 45, weekly: true };

/** Validates a settings patch from the dashboard; throws on anything out of range. */
export function parseAlerts(input: unknown, base = DEFAULT_ALERTS): AlertConfig {
  const v = { ...base, ...(input && typeof input === 'object' ? input : {}) } as AlertConfig;
  const int = (x: unknown, lo: number, hi: number) => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
  if (typeof v.enabled !== 'boolean' || typeof v.weekly !== 'boolean') throw new Error('enabled/weekly must be true or false');
  if (!int(v.high, 50, 100) || !int(v.low, 5, 50) || v.low >= v.high) throw new Error('Thresholds: low 5–50, high 50–100, low < high');
  if (!int(v.hotC, 30, 70)) throw new Error('Temperature limit must be 30–70 °C');
  return { enabled: v.enabled, high: v.high, low: v.low, hotC: v.hotC, weekly: v.weekly };
}

/** Messages to show for the step from `prev` to `cur` (threshold crossings only, so each fires once). */
export function alertsFor(prev: Sample | null, cur: Sample, c: AlertConfig): string[] {
  if (!c.enabled || !prev) return [];
  const out: string[] = [];
  const drain = drainBetween(prev, cur);
  if (drain?.abnormal) out.push(`Lost ${drain.lost}% in ${drain.hours}h while asleep (${drain.ratePerHour}%/h). Something may be keeping the laptop awake.`);
  if (cur.acConnected && prev.percent < c.high && cur.percent >= c.high) out.push(`${cur.percent}% reached. Unplug to reduce battery wear.`);
  if (!cur.acConnected && prev.percent > c.low && cur.percent <= c.low) out.push(`${cur.percent}% left. Plug in the charger.`);
  if (cur.temperatureC != null && cur.temperatureC >= c.hotC && (prev.temperatureC ?? 0) < c.hotC) out.push(`Battery is hot (${cur.temperatureC.toFixed(1)}°C). Let it cool down.`);
  return out;
}

// Text goes through env vars, never into the script, so it can't break quoting.
const WIN_TOAST = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;
$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);
$t = $x.GetElementsByTagName('text'); $t.Item(0).AppendChild($x.CreateTextNode($env:BL_TITLE)) > $null; $t.Item(1).AppendChild($x.CreateTextNode($env:BL_BODY)) > $null;
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;

/** OS notification (Windows toast / macOS Notification Center). Failures are logged, never thrown. */
export function notify(title: string, body: string) {
  const env = { ...process.env, BL_TITLE: title, BL_BODY: body };
  const done = (e: Error | null) => e && log(`notify failed: ${e.message}`);
  if (process.platform === 'win32') execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_TOAST], { env, windowsHide: true }, done);
  else if (process.platform === 'darwin') execFile('osascript', ['-e', 'display notification (system attribute "BL_BODY") with title (system attribute "BL_TITLE")'], { env }, done);
}
