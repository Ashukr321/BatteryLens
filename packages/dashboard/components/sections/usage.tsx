"use client";

import { useState } from "react";
import { Area, AreaChart, Brush, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, Gradient, StatusLine } from "@/components/sections/states";
import { bucketLabel, fmtHours, useApi, type Range, type Usage } from "@/lib/api";

const RANGES: { value: Range; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "Monthly" },
];

const config = {
  plugged: { label: "On charger", color: "var(--plug)" },
  battery: { label: "On battery", color: "var(--batt)" },
  off: { label: "Sleep / off", color: "var(--off)" },
} satisfies ChartConfig;

export function RangeTabs({ range, onRange, month, onMonth }: { range: Range; onRange: (r: Range) => void; month: string; onMonth: (m: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Tabs value={range} onValueChange={(v) => onRange(v as Range)}>
        <TabsList>
          {RANGES.map((r) => (
            <TabsTrigger key={r.value} value={r.value}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {range === "month" && <Input type="month" value={month} onChange={(e) => onMonth(e.target.value)} className="w-40" aria-label="Month" />}
    </div>
  );
}

export function UsageSection({ initialRange = "7d", controls = true }: { initialRange?: Range; controls?: boolean }) {
  const [range, setRange] = useState<Range>(initialRange);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data: u, error } = useApi<Usage>(`/api/usage?range=${range}${range === "month" ? `&month=${month}` : ""}`);
  const label = RANGES.find((r) => r.value === range)!.label;

  return (
    <div className="grid gap-4">
      {controls && <RangeTabs range={range} onRange={setRange} month={month} onMonth={setMonth} />}
      {!u ? (
        <StatusLine error={error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Total title="On charger" hours={u.totals.plugged} color="var(--plug)" />
            <Total title="On battery" hours={u.totals.battery} color="var(--batt)" />
            <Total title="Sleep / off / no data" hours={u.totals.off} color="var(--off)" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Charger vs battery — {range === "month" ? month : label}</CardTitle>
              <CardDescription>Hours per {u.bucket}</CardDescription>
            </CardHeader>
            <CardContent>
              {u.totals.plugged + u.totals.battery === 0 ? (
                <EmptyState />
              ) : (
                <ChartContainer config={config} className="h-72 w-full">
                  {/* Sleep/off is left out of the chart (it dwarfs active time); it's in the totals above. */}
                  <AreaChart data={u.rows} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <Gradient id="fill-plugged" color="var(--color-plugged)" />
                      <Gradient id="fill-battery" color="var(--color-battery)" />
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} formatter={(v, n) => `${config[n as keyof typeof config].label}: ${fmtHours(Number(v ?? 0))}`} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area dataKey="plugged" stackId="a" type="monotone" stroke="var(--color-plugged)" strokeWidth={2} fill="url(#fill-plugged)" isAnimationActive={false} />
                    <Area dataKey="battery" stackId="a" type="monotone" stroke="var(--color-battery)" strokeWidth={2} fill="url(#fill-battery)" isAnimationActive={false} />
                    {controls && u.rows.length > 14 && <Brush dataKey="key" height={20} tickFormatter={bucketLabel} stroke="var(--muted-foreground)" />}
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Total({ title, hours, color }: { title: string; hours: number; color: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} /> {title}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{fmtHours(hours)}</CardTitle>
      </CardHeader>
    </Card>
  );
}
