import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { Activity, Adapter, DeviceInfo, Sample } from './types.js';

const run = promisify(execFile);
const END = '__BL_END__';

/** One long-lived PowerShell, so the 60s collector doesn't spawn a new one each minute. */
class Shell {
  private ps?: ChildProcessWithoutNullStreams;
  private queue = Promise.resolve('');

  exec(script: string): Promise<string> {
    const job = this.queue.then(() => this.send(script));
    this.queue = job.catch(() => '');
    return job;
  }

  private send(script: string): Promise<string> {
    if (!this.ps) {
      this.ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'], { windowsHide: true });
      this.ps.stdout.setEncoding('utf8');
      this.ps.on('exit', () => (this.ps = undefined));
    }
    const ps = this.ps;
    return new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => { cleanup(); this.close(); reject(new Error('powershell timeout')); }, 30_000);
      const onData = (d: string) => {
        buf += d;
        const i = buf.indexOf(END);
        if (i >= 0) { cleanup(); resolve(buf.slice(0, i).trim()); }
      };
      const cleanup = () => { clearTimeout(timer); ps.stdout.off('data', onData); };
      ps.stdout.on('data', onData);
      // "-Command -" runs each line as it arrives; keep the script on one line.
      ps.stdin.write(`${script.replace(/\r?\n/g, ' ')}; Write-Output '${END}'\n`);
    });
  }

  close() { this.ps?.kill(); this.ps = undefined; }
}

const LIVE = `
$b = Get-CimInstance Win32_Battery | Select-Object -First 1;
if (-not $b) { '{}' } else {
  $s = Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1;
  $f = Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue | Select-Object -First 1;
  $c = Get-CimInstance -Namespace root/wmi -ClassName BatteryCycleCount -ErrorAction SilentlyContinue | Select-Object -First 1;
  @{ percent = $b.EstimatedChargeRemaining; status = $b.BatteryStatus; online = $s.PowerOnline; charging = $s.Charging;
     voltage = $s.Voltage; remaining = $s.RemainingCapacity; full = $f.FullChargedCapacity; cycles = $c.CycleCount } | ConvertTo-Json -Compress }`;

// Idle time (GetLastInputInfo), display-off timeouts (last two powercfg values: AC, DC; labels are localized)
// and per-app CPU seconds since the previous call ($global:blPrev lives on in the persistent shell). No admin needed.
const ACTIVITY = String.raw`if (-not ('BLIdle' -as [type])) { Add-Type 'using System; using System.Runtime.InteropServices; public static class BLIdle { [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p); public static long Ms() { var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l); if (!GetLastInputInfo(ref l)) return -1; return (long)(uint)((uint)Environment.TickCount - l.dwTime); } }' };
$v = @([regex]::Matches((powercfg /q SCHEME_CURRENT SUB_VIDEO VIDEOIDLE | Out-String), '0x[0-9a-fA-F]{8}') | ForEach-Object { [Convert]::ToInt64($_.Value, 16) });
$now = @{}; Get-Process | Where-Object { $_.CPU -ne $null -and $_.Id -ne 0 -and $_.Id -ne $PID } | ForEach-Object { $now[[string]$_.Id] = @($_.ProcessName, $_.CPU) };
$apps = @{}; if ($global:blPrev) { foreach ($k in $now.Keys) { $p = $global:blPrev[$k]; if ($p -and $p[0] -eq $now[$k][0]) { $d = $now[$k][1] - $p[1]; if ($d -gt 0) { $apps[$now[$k][0]] += $d } } } };
$global:blPrev = $now;
$top = @{}; $apps.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { $top[$_.Key] = [math]::Round($_.Value, 2) };
@{ idleMs = [BLIdle]::Ms(); acTimeout = $v[-2]; dcTimeout = $v[-1]; apps = $top } | ConvertTo-Json -Compress`;

/** Screen counts as on until idle reaches the display-off timeout; 0 means "never turn off". */
export const screenOnFrom = (idleMs: number, timeoutS?: number) => idleMs >= 0 && (!timeoutS || idleMs < timeoutS * 1000);

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false });

/** powercfg is slow (~1s), so callers should cache this; the doc suggests every few hours. */
export async function batteryReport(): Promise<any> {
  const file = path.join(os.tmpdir(), `batterylens-${process.pid}.xml`);
  await run('powercfg', ['/batteryreport', '/xml', '/output', file], { windowsHide: true });
  try {
    return parser.parse(fs.readFileSync(file, 'utf8')).BatteryReport;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (x: unknown) => (x === '' || x == null || isNaN(Number(x)) ? undefined : Number(x));

/** Converts powercfg RecentUsage entries into minute samples. Exported for tests. */
export function usageToSamples(entries: any[]): Sample[] {
  const out: Sample[] = [];
  const list = entries
    .map((e) => ({ ...e, t: Date.parse(e.Timestamp) }))
    .filter((e) => !isNaN(e.t))
    .sort((a, b) => a.t - b.t);
  for (let i = 0; i < list.length - 1; i++) {
    const e = list[i];
    // Standby/suspend periods are left as gaps; analytics counts gaps as sleep/off.
    if (e.EntryType !== 'Active') continue;
    const full = num(e.FullChargeCapacity);
    const from = num(e.ChargeCapacity);
    const to = num(list[i + 1].ChargeCapacity);
    if (!full || from == null) continue;
    const end = list[i + 1].t;
    const steps = Math.max(1, Math.round((end - e.t) / 60_000));
    for (let k = 0; k < steps; k++) {
      const cap = to == null ? from : from + ((to - from) * k) / steps;
      out.push({
        ts: e.t + k * 60_000,
        percent: Math.max(0, Math.min(100, Math.round((cap / full) * 100))),
        acConnected: e.Ac === '1',
        charging: e.Ac === '1' && to != null && to > from,
        fullChargeCapacity: full,
      });
    }
  }
  return out;
}

/**
 * Matches the taskbar: Windows shows round(Remaining / FullCharged). Win32_Battery's
 * EstimatedChargeRemaining is floored/smoothed and can trail it by a percent or more.
 */
export function livePercent(j: { percent: number; remaining?: number; full?: number }) {
  if (!j.remaining || !j.full) return j.percent;
  return Math.max(0, Math.min(100, Math.round((j.remaining / j.full) * 100)));
}

export function windowsAdapter(): Adapter {
  const shell = new Shell();
  return {
    async device(): Promise<DeviceInfo | null> {
      const r = await batteryReport();
      const b = arr(r?.Batteries?.Battery)[0];
      if (!b) return null;
      const sys = r.SystemInformation ?? {};
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command',
        '(Get-CimInstance Win32_OperatingSystem).Caption + " " + (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion").DisplayVersion'],
        { windowsHide: true }).catch(() => ({ stdout: `Windows ${os.release()}` }));
      return {
        userName: os.userInfo().username,
        computerName: sys.ComputerName || os.hostname(),
        laptopModel: sys.SystemProductName || 'Unknown',
        laptopManufacturer: sys.SystemManufacturer || 'Unknown',
        os: stdout.trim().replace(/^Microsoft /, ''),
        battery: {
          manufacturer: b.Manufacturer || undefined,
          model: b.Id || undefined,
          serial: b.SerialNumber || undefined,
          chemistry: b.Chemistry || undefined,
          manufactureDate: b.ManufactureDate || undefined,
          firstSeenDate: new Date().toISOString(),
          designCapacity: num(b.DesignCapacity) ?? 0,
          capacityUnit: 'mWh',
        },
      };
    },

    async sample(): Promise<Sample | null> {
      const j = JSON.parse((await shell.exec(LIVE)) || '{}');
      if (j.percent == null) return null;
      // Win32_Battery.BatteryStatus 2 = on AC; root/wmi PowerOnline is more accurate when present.
      const ac = j.online ?? j.status === 2;
      return {
        ts: Date.now(),
        percent: livePercent(j),
        acConnected: !!ac,
        charging: j.charging ?? [6, 7, 8, 9].includes(j.status),
        fullChargeCapacity: j.full || undefined,
        cycleCount: j.cycles || undefined,
        voltageMv: j.voltage || undefined,
      };
    },

    async history() {
      const r = await batteryReport();
      return usageToSamples(arr(r?.RecentUsage?.UsageEntry));
    },

    async activity(acConnected): Promise<Activity> {
      const j = JSON.parse((await shell.exec(ACTIVITY)) || '{}');
      return {
        screenOn: screenOnFrom(j.idleMs ?? -1, acConnected ? j.acTimeout : j.dcTimeout),
        apps: j.apps && Object.keys(j.apps).length ? j.apps : undefined,
      };
    },

    close: () => shell.close(),
  };
}
