"use client";

import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ExternalLink, Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, useSeriesToggle, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, Gradient, StatusLine } from "@/components/sections/states";
import { bucketLabel, fmtDate, healthColor, useApi, type DeviceInfo, type Habits, type Health } from "@/lib/api";
import { useT } from "@/lib/i18n";

type HealthRange = "24h" | "30d" | "month";

export function HealthSection({ controls = true }: { controls?: boolean }) {
  const t = useT();
  const capSeries = useSeriesToggle();
  const [range, setRange] = useState<HealthRange>("30d");
  const { data: h, error } = useApi<Health>(`/api/health?range=${range}`);

  const healthConfig = {
    health: { label: t("Health %"), color: "var(--batt)" },
    forecast: { label: t("Forecast"), color: "var(--warn)" },
  } satisfies ChartConfig;
  const capConfig = {
    fullChargeCapacity: { label: t("Full charge"), color: "var(--plug)" },
    designCapacity: { label: t("Design"), color: "var(--muted-foreground)" },
  } satisfies ChartConfig;

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
            <TabsTrigger value="30d">{t("30 days")}</TabsTrigger>
            <TabsTrigger value="month">{t("This month")}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {!h ? (
        <StatusLine error={error} />
      ) : (
        <>
          <div className="grid gap-4 @xl:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardDescription>{t("Current health")}</CardDescription>
                <CardTitle className="text-3xl tabular-nums" style={{ color: healthColor(h.current) }}>
                  {h.current != null ? `${h.current}%` : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>{t("Trend")}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{h.forecast ? `${h.forecast.slopePerMonth > 0 ? "+" : ""}${h.forecast.slopePerMonth}% / ${t("month")}` : "—"}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>{t("Reaches 80% (replacement point)")}</CardDescription>
                <CardTitle className="text-xl">{h.forecast?.reach80 ? `~${fmtDate(h.forecast.reach80)}` : t(h.forecast?.note ?? "Need 3+ days of data")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ReplacementLink />
              </CardContent>
            </Card>
          </div>

          <HabitCard />

          <Card>
            <CardHeader>
              <CardTitle>{t("Health over time")}</CardTitle>
              <CardDescription>{t("Dashed line = linear forecast")}</CardDescription>
            </CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <EmptyState />
              ) : (
                <ChartContainer config={healthConfig} className="h-56 w-full @3xl:h-72">
                  <ComposedChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <Gradient id="fill-health" color="var(--color-health)" />
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis domain={["dataMin - 5", 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}%`} />
                    <ReferenceLine y={80} stroke="var(--warn)" strokeDasharray="2 4" label={{ value: t("80% replace"), position: "insideTopRight", fill: "var(--warn)", fontSize: 11 }} />
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
              <CardTitle>{t("Design vs full charge capacity")}</CardTitle>
              <CardDescription>{t("Gap = capacity lost to wear")}</CardDescription>
            </CardHeader>
            <CardContent>
              {h.series.length === 0 ? (
                <EmptyState />
              ) : (
                <ChartContainer config={capConfig} className="h-56 w-full @3xl:h-72">
                  <ComposedChart data={h.series} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <Gradient id="fill-capacity" color="var(--color-fullChargeCapacity)" />
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis domain={[0, "dataMax"]} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} />} />
                    <ChartLegend content={<ChartLegendContent {...capSeries.legend} />} />
                    <Area dataKey="fullChargeCapacity" hide={capSeries.isHidden("fullChargeCapacity")} type="monotone" stroke="var(--color-fullChargeCapacity)" strokeWidth={2} fill="url(#fill-capacity)" isAnimationActive={false} />
                    <Line dataKey="designCapacity" hide={capSeries.isHidden("designCapacity")} stroke="var(--color-designCapacity)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <TemperatureCard temperature={h.temperature} />
        </>
      )}
    </div>
  );
}

/** Web search for this laptop's replacement battery; a plain link, nothing is fetched by BatteryLens. */
function ReplacementLink() {
  const t = useT();
  const { data: d } = useApi<DeviceInfo>("/api/device");
  if (!d) return null;
  const q = `${d.laptopManufacturer} ${d.laptopModel} battery replacement`;
  return (
    <a href={`https://www.google.com/search?q=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline print:hidden">
      {t("Find a replacement battery")} <ExternalLink className="size-3.5" />
    </a>
  );
}

export function HabitCard() {
  const t = useT();
  const { data: h, error } = useApi<Habits>("/api/habits?range=30d");
  if (!h) return <StatusLine error={error} />;
  const color = h.score == null ? "var(--off)" : h.score >= 80 ? "var(--batt)" : h.score >= 60 ? "var(--warn)" : "var(--bad)";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Battery habit score")}</CardTitle>
        <CardDescription>{t("Last 30 days · how kindly the battery is being treated")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 @xl:grid-cols-[auto_1fr]">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-bold tabular-nums" style={{ color }}>
            {h.score ?? "—"}
          </span>
          <span className="text-muted-foreground">/ 100</span>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Fact label={t("At 100% on charger")} value={h.fullWhilePluggedPct != null ? `${h.fullWhilePluggedPct}%` : "—"} />
            <Fact label={t("Deep discharges")} value={String(h.deepDischarges)} />
            <Fact label={t("Time above 40°C")} value={h.hotPct != null ? `${h.hotPct}%` : t("n/a")} />
          </div>
          {h.score == null ? (
            <p className="text-sm text-muted-foreground">{t("Need at least an hour of data.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {h.tips.map((tip) => (
                <li key={tip} className="flex items-start gap-1.5">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" /> {t(tip)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function TemperatureCard({ temperature }: { temperature: Health["temperature"] }) {
  const t = useT();
  const series = useSeriesToggle();
  const config = {
    avg: { label: t("Average"), color: "var(--batt)" },
    max: { label: t("Max"), color: "var(--bad)" },
  } satisfies ChartConfig;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Battery temperature")}</CardTitle>
        <CardDescription>{t("Above 40°C speeds up wear")}</CardDescription>
      </CardHeader>
      <CardContent>
        {temperature.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("This laptop doesn't report battery temperature (common on Windows).")}</p>
        ) : (
          <ChartContainer config={config} className="h-56 w-full @3xl:h-72">
            <ComposedChart data={temperature} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis domain={["dataMin - 3", "dataMax + 3"]} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}°`} />
              <ReferenceLine y={40} stroke="var(--warn)" strokeDasharray="2 4" />
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} formatter={(v, n) => `${config[n as keyof typeof config].label}: ${v}°C`} />} />
              <ChartLegend content={<ChartLegendContent {...series.legend} />} />
              <Line dataKey="avg" hide={series.isHidden("avg")} stroke="var(--color-avg)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="max" hide={series.isHidden("max")} stroke="var(--color-max)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
