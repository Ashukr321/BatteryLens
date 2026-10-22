"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { BatteryCharging, BatteryFull, Calendar, CircleCheck, Cpu, Laptop, PlugZap, Thermometer, TrendingDown, TriangleAlert, User, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, Gradient, StatusLine } from "@/components/sections/states";
import { fmtDate, fmtHours, fmtTime, healthColor, maskSerial, useApi, useLive, type Anomalies, type DeviceInfo, type Health, type Sample, type Usage } from "@/lib/api";
import { useT } from "@/lib/i18n";

const DAY = 86_400_000;
/** Below this, a charger is likely slower than the laptop's stock adapter. */
const SLOW_CHARGER_W = 30;

export function DeviceCard({ mask = false }: { mask?: boolean }) {
  const t = useT();
  const { data: d, error } = useApi<DeviceInfo>("/api/device");
  if (!d) return <StatusLine error={error} />;
  const b = d.battery;
  const rows: [React.ElementType, string, string][] = [
    [User, t("User"), d.userName],
    [Laptop, t("Laptop"), `${d.laptopManufacturer} ${d.laptopModel}`],
    [Cpu, t("OS"), d.os],
    [BatteryFull, t("Battery"), [b.manufacturer, b.model].filter(Boolean).join(" · ") || "—"],
    [BatteryFull, t("Serial"), mask ? maskSerial(b.serial) : (b.serial ?? "—")],
    [BatteryFull, t("Chemistry"), b.chemistry ?? "—"],
    [Calendar, b.manufactureDate ? t("Manufactured") : t("First seen"), fmtDate(b.manufactureDate || b.firstSeenDate)],
    [Zap, t("Design capacity"), `${b.designCapacity.toLocaleString()} ${b.capacityUnit}`],
  ];
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{d.computerName}</CardTitle>
        <CardDescription>{t("Device & battery")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <span className="w-24 shrink-0 text-muted-foreground @[22rem]/card:w-32">{label}</span>
            <span className="truncate font-medium">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HealthGauge() {
  const t = useT();
  const { data: h, error } = useApi<Health>("/api/health?range=30d");
  if (!h) return <StatusLine error={error} />;
  const value = h.current ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Battery health")}</CardTitle>
        <CardDescription>{t("Full charge vs design capacity")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <ChartContainer config={{ health: { label: t("Health") } }} className="aspect-square h-48">
          <RadialBarChart data={[{ health: value }]} startAngle={90} endAngle={-270} innerRadius="75%" outerRadius="100%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="health" background cornerRadius={8} fill={healthColor(h.current)} isAnimationActive={false} />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-3xl font-bold">
              {h.current != null ? `${h.current}%` : "—"}
            </text>
          </RadialBarChart>
        </ChartContainer>
        <p className="text-sm text-muted-foreground">
          {h.fullChargeCapacity?.toLocaleString() ?? "—"} / {h.designCapacity.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

export function LiveCard() {
  const t = useT();
  const { data: s, error } = useLive();
  if (!s) return <StatusLine error={error} />;
  const state = s.charging ? t("Charging") : s.acConnected ? t("Plugged in") : t("On battery");
  const slowCharger = s.acConnected && s.adapterWatts != null && s.adapterWatts < SLOW_CHARGER_W;
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("Live")}</CardTitle>
        <CardDescription>{t("Updated {time}", { time: fmtTime(s.ts) })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-4xl font-bold tabular-nums @[20rem]/card:text-5xl">{s.percent}%</span>
          <Badge variant={s.acConnected ? "default" : "secondary"} className="mb-2">
            {s.charging ? <BatteryCharging className="animate-pulse" /> : s.acConnected ? <PlugZap /> : <BatteryFull />} {state}
          </Badge>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${s.percent}%`, background: s.percent < 20 ? "var(--bad)" : "var(--batt)" }} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm @[20rem]/card:grid-cols-3">
          <Stat icon={Thermometer} label={t("Temp")} value={s.temperatureC != null ? `${s.temperatureC.toFixed(1)}°C` : "—"} />
          <Stat icon={Zap} label={t("Voltage")} value={s.voltageMv ? `${(s.voltageMv / 1000).toFixed(2)} V` : "—"} />
          <Stat icon={PlugZap} label={t("Adapter")} value={s.adapterWatts ? `${s.adapterWatts} W` : "—"} />
        </div>
        {slowCharger && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--warn)]">
            <TriangleAlert className="size-4" /> {t("Low-wattage charger ({w} W). Charging may be slow.", { w: s.adapterWatts! })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

/** [from, to] for a local day ("YYYY-MM-DD"), or the last 24h. Rounded to the minute so the fetch path stays stable. */
function window24h(day?: string): [number, number] {
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  if (!day) return [now - DAY, now];
  const [y, m, d] = day.split("-").map(Number);
  return [new Date(y, m - 1, d).getTime(), Math.min(now, new Date(y, m - 1, d + 1).getTime() - 1)];
}

/** Battery level over the last 24h (or one `day`), with charger-connected stretches shaded. */
export function BatteryLevelChart({ day, bare = false }: { day?: string; bare?: boolean }) {
  const t = useT();
  const [[from, to]] = useState(() => window24h(day));
  const { data, error } = useApi<Sample[]>(`/api/samples?from=${from}&to=${to}`);
  if (!data) return <StatusLine error={error} />;

  // A null point at each sleep gap breaks the line instead of drawing across the gap.
  const points: { ts: number; percent: number | null }[] = [];
  data.forEach((s, i) => {
    if (i && s.ts - data[i - 1].ts > 3 * 60_000) points.push({ ts: data[i - 1].ts + 60_000, percent: null });
    points.push(s);
  });

  const plugged: { x1: number; x2: number }[] = [];
  for (const s of data) {
    const last = plugged.at(-1);
    if (s.acConnected && last && s.ts - last.x2 <= 3 * 60_000) last.x2 = s.ts;
    else if (s.acConnected) plugged.push({ x1: s.ts, x2: s.ts });
  }

  const chart =
    data.length === 0 ? (
      <EmptyState />
    ) : (
      <ChartContainer config={{ percent: { label: t("Battery %"), color: "var(--batt)" } } satisfies ChartConfig} className="h-56 w-full @3xl:h-72">
        <AreaChart data={points} margin={{ left: -20, right: 8, top: 8 }}>
          <defs>
            <Gradient id={`fill-level-${day ?? "24h"}`} color="var(--color-percent)" />
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="ts" type="number" scale="time" domain={[from, to]} tickFormatter={fmtTime} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          {plugged.map((p) => (
            <ReferenceArea key={p.x1} x1={p.x1} x2={p.x2} fill="var(--plug)" fillOpacity={0.12} ifOverflow="hidden" />
          ))}
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => fmtTime(p?.[0]?.payload?.ts)} />} />
          <Area dataKey="percent" type="monotone" stroke="var(--color-percent)" fill={`url(#fill-level-${day ?? "24h"})`} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    );
  if (bare) return chart;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Battery level — last 24h")}</CardTitle>
        <CardDescription>{t("Shaded = charger connected")}</CardDescription>
      </CardHeader>
      <CardContent>{chart}</CardContent>
    </Card>
  );
}

/** Donut of today's charger vs battery time. */
export function TodayDonut() {
  const t = useT();
  const { data: u, error } = useApi<Usage>("/api/usage?range=24h");
  if (!u) return <StatusLine error={error} />;
  const config = {
    plugged: { label: t("On charger"), color: "var(--plug)" },
    battery: { label: t("On battery"), color: "var(--batt)" },
  } satisfies ChartConfig;
  const parts = [
    { key: "plugged", value: u.totals.plugged },
    { key: "battery", value: u.totals.battery },
  ];
  const total = u.totals.plugged + u.totals.battery;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Last 24h")}</CardTitle>
        <CardDescription>{t("Charger vs battery time")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2">
        {total === 0 ? (
          <EmptyState />
        ) : (
          <ChartContainer config={config} className="aspect-square h-44">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="key" formatter={(v, n) => `${config[n as keyof typeof config].label}: ${fmtHours(Number(v ?? 0))}`} />} />
              <Pie data={parts} dataKey="value" nameKey="key" innerRadius="60%" strokeWidth={2} isAnimationActive={false}>
                {parts.map((p) => (
                  <Cell key={p.key} fill={`var(--color-${p.key})`} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        <div className="flex gap-4 text-sm">
          <Legend color="var(--plug)" label={`${t("Charger")} ${fmtHours(u.totals.plugged)}`} />
          <Legend color="var(--batt)" label={`${t("Battery")} ${fmtHours(u.totals.battery)}`} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Sudden capacity drops and days that drained much faster than usual (last 30 days). */
export function AnomaliesCard() {
  const t = useT();
  const { data, error } = useApi<Anomalies>("/api/anomalies?range=30d");
  if (!data) return <StatusLine error={error} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Anomalies")}</CardTitle>
        <CardDescription>{t("Last 30 days · sudden capacity drops and unusually fast drain")}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.anomalies.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-[var(--batt)]" /> {t("Nothing unusual detected.")}
          </p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {data.anomalies.map((a) => (
              <li key={a.type + a.day} className="flex items-start gap-2 rounded-lg bg-[var(--warn)]/10 p-2">
                {a.type === "capacity" ? <TrendingDown className="mt-0.5 size-4 shrink-0 text-[var(--bad)]" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" />}
                <span>
                  <b>{fmtDate(a.day + "T00:00")}</b> ·{" "}
                  {a.type === "capacity"
                    ? t("Full-charge capacity dropped from {from} to {to} in a day.", { from: a.baseline.toLocaleString(), to: a.value.toLocaleString() })
                    : t("Drained {rate}%/h in use, about {x}× the usual {usual}%/h. Check for a busy app.", { rate: a.value, usual: a.baseline, x: (a.value / a.baseline).toFixed(1) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}
