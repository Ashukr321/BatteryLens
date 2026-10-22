"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { BatteryCharging, BatteryFull, Calendar, Cpu, Laptop, PlugZap, Thermometer, User, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, Gradient, StatusLine } from "@/components/sections/states";
import { fmtDate, fmtHours, fmtTime, healthColor, maskSerial, useApi, type DeviceInfo, type Health, type Sample, type Usage } from "@/lib/api";

const DAY = 86_400_000;

export function DeviceCard({ mask = false }: { mask?: boolean }) {
  const { data: d, error } = useApi<DeviceInfo>("/api/device");
  if (!d) return <StatusLine error={error} />;
  const b = d.battery;
  const rows: [React.ElementType, string, string][] = [
    [User, "User", d.userName],
    [Laptop, "Laptop", `${d.laptopManufacturer} ${d.laptopModel}`],
    [Cpu, "OS", d.os],
    [BatteryFull, "Battery", [b.manufacturer, b.model].filter(Boolean).join(" · ") || "—"],
    [BatteryFull, "Serial", mask ? maskSerial(b.serial) : (b.serial ?? "—")],
    [BatteryFull, "Chemistry", b.chemistry ?? "—"],
    [Calendar, b.manufactureDate ? "Manufactured" : "First seen", fmtDate(b.manufactureDate || b.firstSeenDate)],
    [Zap, "Design capacity", `${b.designCapacity.toLocaleString()} ${b.capacityUnit}`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{d.computerName}</CardTitle>
        <CardDescription>Device &amp; battery</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
            <span className="truncate font-medium">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HealthGauge() {
  const { data: h, error } = useApi<Health>("/api/health?range=30d");
  if (!h) return <StatusLine error={error} />;
  const value = h.current ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Battery health</CardTitle>
        <CardDescription>Full charge vs design capacity</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <ChartContainer config={{ health: { label: "Health" } }} className="aspect-square h-48">
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
  const { data: s, error } = useApi<Sample>("/api/live", 30_000);
  if (!s) return <StatusLine error={error} />;
  const state = s.charging ? "Charging" : s.acConnected ? "Plugged in" : "On battery";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live</CardTitle>
        <CardDescription>Updated {fmtTime(s.ts)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-end gap-3">
          <span className="text-5xl font-bold tabular-nums">{s.percent}%</span>
          <Badge variant={s.acConnected ? "default" : "secondary"} className="mb-2">
            {s.charging ? <BatteryCharging className="animate-pulse" /> : s.acConnected ? <PlugZap /> : <BatteryFull />} {state}
          </Badge>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${s.percent}%`, background: s.percent < 20 ? "var(--bad)" : "var(--batt)" }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Stat icon={Thermometer} label="Temp" value={s.temperatureC != null ? `${s.temperatureC.toFixed(1)}°C` : "—"} />
          <Stat icon={Zap} label="Voltage" value={s.voltageMv ? `${(s.voltageMv / 1000).toFixed(2)} V` : "—"} />
          <Stat icon={PlugZap} label="Adapter" value={s.adapterWatts ? `${s.adapterWatts} W` : "—"} />
        </div>
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

const levelConfig = { percent: { label: "Battery %", color: "var(--batt)" } } satisfies ChartConfig;

/** 24h battery level, with charger-connected stretches shaded. */
export function BatteryLevelChart() {
  // Rounded to the minute so the path (and fetch) stays stable across renders.
  const from = Math.floor((Date.now() - DAY) / 60_000) * 60_000;
  const { data, error } = useApi<Sample[]>(`/api/samples?from=${from}`);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Battery level — last 24h</CardTitle>
        <CardDescription>Shaded = charger connected</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState />
        ) : (
          <ChartContainer config={levelConfig} className="h-64 w-full">
            <AreaChart data={points} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                <Gradient id="fill-level" color="var(--color-percent)" />
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="ts" type="number" scale="time" domain={[from, Date.now()]} tickFormatter={fmtTime} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              {plugged.map((p) => (
                <ReferenceArea key={p.x1} x1={p.x1} x2={p.x2} fill="var(--plug)" fillOpacity={0.12} ifOverflow="hidden" />
              ))}
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => fmtTime(p?.[0]?.payload?.ts)} />} />
              <Area dataKey="percent" type="monotone" stroke="var(--color-percent)" fill="url(#fill-level)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

const todayConfig = {
  plugged: { label: "On charger", color: "var(--plug)" },
  battery: { label: "On battery", color: "var(--batt)" },
} satisfies ChartConfig;

/** Donut of today's charger vs battery time. */
export function TodayDonut() {
  const { data: u, error } = useApi<Usage>("/api/usage?range=24h");
  if (!u) return <StatusLine error={error} />;
  const parts = [
    { key: "plugged", value: u.totals.plugged },
    { key: "battery", value: u.totals.battery },
  ];
  const total = u.totals.plugged + u.totals.battery;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 24h</CardTitle>
        <CardDescription>Charger vs battery time</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2">
        {total === 0 ? (
          <EmptyState />
        ) : (
          <ChartContainer config={todayConfig} className="aspect-square h-44">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="key" formatter={(v, n) => `${todayConfig[n as keyof typeof todayConfig].label}: ${fmtHours(Number(v ?? 0))}`} />} />
              <Pie data={parts} dataKey="value" nameKey="key" innerRadius="60%" strokeWidth={2} isAnimationActive={false}>
                {parts.map((p) => (
                  <Cell key={p.key} fill={`var(--color-${p.key})`} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        <div className="flex gap-4 text-sm">
          <Legend color="var(--plug)" label={`Charger ${fmtHours(u.totals.plugged)}`} />
          <Legend color="var(--batt)" label={`Battery ${fmtHours(u.totals.battery)}`} />
        </div>
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
