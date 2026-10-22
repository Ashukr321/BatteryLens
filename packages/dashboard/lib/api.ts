"use client";

import { useEffect, useState } from "react";

// Shapes mirror packages/cli/src (adapters/types.ts, analytics.ts).
export interface DeviceInfo {
  userName: string;
  computerName: string;
  laptopModel: string;
  laptopManufacturer: string;
  os: string;
  battery: {
    manufacturer?: string;
    model?: string;
    serial?: string;
    chemistry?: string;
    manufactureDate?: string;
    firstSeenDate: string;
    designCapacity: number;
    capacityUnit: "mWh" | "mAh";
    designCycleCount?: number;
  };
}

export interface Sample {
  ts: number;
  percent: number;
  acConnected: boolean;
  charging: boolean;
  fullChargeCapacity?: number;
  cycleCount?: number;
  temperatureC?: number;
  voltageMv?: number;
  adapterWatts?: number;
}

export type Range = "24h" | "7d" | "14d" | "30d" | "month";

export interface Usage {
  range: Range;
  from: number;
  to: number;
  bucket: "hour" | "day";
  totals: { plugged: number; battery: number; off: number };
  rows: { key: string; plugged: number; battery: number; off: number }[];
}

export interface Health {
  current: number | null;
  fullChargeCapacity: number | null;
  designCapacity: number;
  series: { key: string; fullChargeCapacity: number; designCapacity: number; health: number | null }[];
  forecast: { slopePerMonth: number; reach80: string | null; note: string | null } | null;
}

export interface Cycles {
  osCycleCount: number | null;
  designCycleCount: number;
  designCycleAssumed: boolean;
  cycleLifeUsed: number | null;
  fullCharges: number;
  equivalentCycles: number;
  fullChargesPerDay: { day: string; count: number }[];
  sessions: { start: number; end: number; startPercent: number; endPercent: number; minutes: number; ratePerHour: number }[];
}

export interface DataStats {
  days: number;
  oldest: string | null;
  newest: string | null;
  sizeMB: number;
  samples: number;
}

/** Fetches a JSON API path; re-fetches every `refreshMs` when given. `reload` forces a refetch. */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const load = () =>
      fetch(path)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
        .then((d) => !cancelled && (setData(d), setError(null)))
        .catch((e) => !cancelled && setError(e.message));
    load();
    const id = refreshMs ? setInterval(load, refreshMs) : undefined;
    // Live views also refresh the moment the tab regains focus, instead of waiting for the next tick.
    const onVisible = () => document.visibilityState === "visible" && load();
    if (refreshMs) document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, refreshMs, tick]);

  return { data, error, loading: !data && !error, reload: () => setTick((t) => t + 1) };
}

/** Session token injected by the CLI server into the HTML; required for destructive calls. */
export const sessionToken = () => (typeof window === "undefined" ? "" : ((window as unknown as { __BL_TOKEN__?: string }).__BL_TOKEN__ ?? "dev"));

export const fmtHours = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m`;
export const fmtDate = (d: string | number) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (d: number) => new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
export const maskSerial = (s?: string) => (s ? (s.length > 4 ? "X".repeat(s.length - 4) + s.slice(-4) : s) : "—");
export const healthColor = (h: number | null) => (h == null ? "var(--off)" : h > 80 ? "var(--batt)" : h >= 60 ? "var(--warn)" : "var(--bad)");

/** "2026-10-22" or "2026-10-22 14:00" → short axis label. */
export const bucketLabel = (key: string) =>
  key.length > 10 ? key.slice(11, 13) + "h" : new Date(key + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
