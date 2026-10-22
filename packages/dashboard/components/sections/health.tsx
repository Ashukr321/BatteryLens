"use client";

import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, Gradient, StatusLine } from "@/components/sections/states";
import { bucketLabel, fmtDate, healthColor, useApi, type Health } from "@/lib/api";

const healthConfig = {
  health: { label: "Health %", color: "var(--batt)" },
  forecast: { label: "Forecast", color: "var(--warn)" },
} satisfies ChartConfig;

const capConfig = {
  fullChargeCapacity: { label: "Full charge", color: "var(--plug)" },
  designCapacity: { label: "Design", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type HealthRange = "24h" | "30d" | "month";

export function HealthSection({ controls = true }: { controls?: boolean }) {
  const [range, setRange] = useState<HealthRange>("30d");
  const { data: h, error } = useApi<Health>(`/api/health?range=${range}`);

  // Extend the trend line to the 80% date so the forecast is visible on the chart.
  const series: Record<string, number | string | null>[] = h?.series.map((p) => ({ ...p })) ?? [];
  if (h?.forecast?.reach80 && series.length) {
    series[series.length - 1].forecast = series[series.length - 1].health;
    series.push({ key: h.forecast.reach80, forecast: 80 });
  }

  return (
    <div className="grid gap-4">
      {controls && (
        <Tabs value={range} onValueChange={(v) => setRange(v as HealthRange)} className="print:hidden">
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {!h ? (
        <StatusLine error={error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardDescription>Current health</CardDescription>
                <CardTitle className="text-3xl tabular-nums" style={{ color: healthColor(h.current) }}>
                  {h.current != null ? `${h.current}%` : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Trend</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{h.forecast ? `${h.forecast.slopePerMonth > 0 ? "+" : ""}${h.forecast.slopePerMonth}% / month` : "—"}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Reaches 80% (replacement point)</CardDescription>
                <CardTitle className="text-xl">{h.forecast?.reach80 ? `~${fmtDate(h.forecast.reach80)}` : (h.forecast?.note ?? "Need 3+ days of data")}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Health over time</CardTitle>
              <CardDescription>Dashed line = linear forecast</CardDescription>
            </CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <EmptyState />
              ) : (
                <ChartContainer config={healthConfig} className="h-64 w-full">
                  <ComposedChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <Gradient id="fill-health" color="var(--color-health)" />
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis domain={["dataMin - 5", 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}%`} />
                    <ReferenceLine y={80} stroke="var(--warn)" strokeDasharray="2 4" label={{ value: "80% replace", position: "insideTopRight", fill: "var(--warn)", fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} />} />
                    <Area dataKey="health" type="monotone" stroke="var(--color-health)" strokeWidth={2} fill="url(#fill-health)" dot={{ r: 3 }} isAnimationActive={false} connectNulls />
                    <Line dataKey="forecast" stroke="var(--color-forecast)" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Design vs full charge capacity</CardTitle>
              <CardDescription>Gap = capacity lost to wear</CardDescription>
            </CardHeader>
            <CardContent>
              {h.series.length === 0 ? (
                <EmptyState />
              ) : (
                <ChartContainer config={capConfig} className="h-64 w-full">
                  <ComposedChart data={h.series} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <Gradient id="fill-capacity" color="var(--color-fullChargeCapacity)" />
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis domain={[0, "dataMax"]} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area dataKey="fullChargeCapacity" type="monotone" stroke="var(--color-fullChargeCapacity)" strokeWidth={2} fill="url(#fill-capacity)" isAnimationActive={false} />
                    <Line dataKey="designCapacity" stroke="var(--color-designCapacity)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
