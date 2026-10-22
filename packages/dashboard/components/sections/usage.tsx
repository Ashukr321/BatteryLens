"use client";

import { useState } from "react";
import { Area, AreaChart, Brush, CartesianGrid, XAxis, YAxis } from "recharts";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, useSeriesToggle, type ChartConfig } from "@/components/ui/chart";
import { BatteryLevelChart } from "@/components/sections/overview";
import { EmptyState, Gradient, StatusLine } from "@/components/sections/states";
import { bucketLabel, fmtDate, fmtHours, fmtTime, useApi, type Range, type SleepDrain, type Usage } from "@/lib/api";
import { useT } from "@/lib/i18n";

const RANGES: { value: Range; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "Monthly" },
];

function useUsageConfig() {
  const t = useT();
  return {
    plugged: { label: t("On charger"), color: "var(--plug)" },
    battery: { label: t("On battery"), color: "var(--batt)" },
    off: { label: t("Sleep / off"), color: "var(--off)" },
  } satisfies ChartConfig;
}

export function RangeTabs({ range, onRange, month, onMonth }: { range: Range; onRange: (r: Range) => void; month: string; onMonth: (m: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Tabs value={range} onValueChange={(v) => onRange(v as Range)} className="max-w-full overflow-x-auto">
        <TabsList>
          {RANGES.map((r) => (
            <TabsTrigger key={r.value} value={r.value}>
              {t(r.label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {range === "month" && <Input type="month" value={month} onChange={(e) => onMonth(e.target.value)} className="w-40" aria-label={t("Month")} />}
    </div>
  );
}

export function UsageSection({ initialRange = "7d", controls = true }: { initialRange?: Range; controls?: boolean }) {
  const t = useT();
  const config = useUsageConfig();
  const series = useSeriesToggle();
  const [range, setRange] = useState<Range>(initialRange);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const query = `range=${range}${range === "month" ? `&month=${month}` : ""}`;
  const { data: u, error } = useApi<Usage>(`/api/usage?${query}`);
  const label = t(RANGES.find((r) => r.value === range)!.label);

  return (
    <div className="grid gap-4">
      {controls && <RangeTabs range={range} onRange={setRange} month={month} onMonth={setMonth} />}
      {!u ? (
        <StatusLine error={error} />
      ) : (
        <>
          <div className="grid gap-4 @xl:grid-cols-3">
            <Total title={t("On charger")} hours={u.totals.plugged} color="var(--plug)" />
            <Total title={t("On battery")} hours={u.totals.battery} color="var(--batt)" />
            <Total title={t("Sleep / off / no data")} hours={u.totals.off} color="var(--off)" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                {t("Charger vs battery")} — {range === "month" ? month : label}
              </CardTitle>
              <CardDescription>
                {u.bucket === "hour" ? t("Hours per hour") : t("Hours per day")}
                {controls && ` · ${t("Click a day for details")}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {u.totals.plugged + u.totals.battery === 0 ? (
                <EmptyState />
              ) : (
                <ChartContainer config={config} className={`h-60 w-full @3xl:h-80 ${controls ? "cursor-pointer" : ""}`}>
                  {/* Sleep/off is left out of the chart (it dwarfs active time); it's in the totals above. */}
                  <AreaChart data={u.rows} margin={{ left: -20, right: 8, top: 8 }} onClick={(e) => controls && e?.activeLabel && setDay(String(e.activeLabel).slice(0, 10))}>
                    <defs>
                      <Gradient id="fill-plugged" color="var(--color-plugged)" />
                      <Gradient id="fill-battery" color="var(--color-battery)" />
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} formatter={(v, n) => `${config[n as keyof typeof config].label}: ${fmtHours(Number(v ?? 0))}`} />} />
                    <ChartLegend content={<ChartLegendContent {...series.legend} />} />
                    <Area dataKey="plugged" hide={series.isHidden("plugged")} stackId="a" type="monotone" stroke="var(--color-plugged)" strokeWidth={2} fill="url(#fill-plugged)" isAnimationActive={false} />
                    <Area dataKey="battery" hide={series.isHidden("battery")} stackId="a" type="monotone" stroke="var(--color-battery)" strokeWidth={2} fill="url(#fill-battery)" isAnimationActive={false} />
                    {controls && u.rows.length > 14 && <Brush dataKey="key" height={20} tickFormatter={bucketLabel} stroke="var(--muted-foreground)" />}
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 @4xl:grid-cols-2">
            <UsageHeatmap onDay={controls ? setDay : undefined} />
            <SleepDrainCard query={query} />
          </div>
        </>
      )}
      <DayDrawer day={day} onClose={() => setDay(null)} />
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

/** Side drawer with one day's totals, hourly split and battery level. */
export function DayDrawer({ day, onClose }: { day: string | null; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet open={!!day} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{day ? fmtDate(day + "T00:00") : ""}</SheetTitle>
          <SheetDescription>{t("Day details")}</SheetDescription>
        </SheetHeader>
        {/* Keyed so each day gets fresh fetches. */}
        {day && <DayDetails key={day} day={day} />}
      </SheetContent>
    </Sheet>
  );
}

function DayDetails({ day }: { day: string }) {
  const t = useT();
  const config = useUsageConfig();
  const { data: u, error } = useApi<Usage>(`/api/usage?range=day&day=${day}`);
  return (
    <div className="grid gap-4 px-4 pb-4 @container">
      {!u ? (
        <StatusLine error={error} />
      ) : (
        <div className="grid grid-cols-3 gap-2 text-sm">
          {(["plugged", "battery", "off"] as const).map((k) => (
            <div key={k} className="rounded-lg bg-muted/50 p-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-sm" style={{ background: config[k].color }} /> {config[k].label}
              </div>
              <div className="font-medium tabular-nums">{fmtHours(u.totals[k])}</div>
            </div>
          ))}
        </div>
      )}
      <h3 className="text-sm font-medium">{t("Battery level")}</h3>
      <BatteryLevelChart day={day} bare />
      {u && u.totals.plugged + u.totals.battery > 0 && (
        <>
          <h3 className="text-sm font-medium">{t("Hours per hour")}</h3>
          <ChartContainer config={config} className="h-48 w-full">
            <AreaChart data={u.rows} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="key" tickFormatter={bucketLabel} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={(v) => `${v}h`} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(k) => bucketLabel(String(k))} formatter={(v, n) => `${config[n as keyof typeof config].label}: ${fmtHours(Number(v ?? 0))}`} />} />
              <Area dataKey="plugged" stackId="a" type="step" stroke="var(--color-plugged)" fill="var(--color-plugged)" fillOpacity={0.3} isAnimationActive={false} />
              <Area dataKey="battery" stackId="a" type="step" stroke="var(--color-battery)" fill="var(--color-battery)" fillOpacity={0.3} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </>
      )}
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** GitHub-style grid of battery hours per day over the stored 30 days. */
export function UsageHeatmap({ onDay }: { onDay?: (day: string) => void }) {
  const t = useT();
  const { data: u, error } = useApi<Usage>("/api/usage?range=30d");
  if (!u) return <StatusLine error={error} />;

  const max = Math.max(...u.rows.map((r) => r.battery), 0.01);
  // Monday-first: pad the first column so each row is one weekday.
  const offset = (new Date(u.rows[0].key + "T00:00").getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...u.rows];
  const weeks = Math.ceil(cells.length / 7);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Battery hours per day")}</CardTitle>
        <CardDescription>{t("Last 30 days · darker = more time on battery")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex gap-1.5 overflow-x-auto">
          <div className="grid grid-rows-7 gap-1 pr-1 text-[10px] leading-none text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <span key={d} className="flex h-5 items-center">
                {t(d)}
              </span>
            ))}
          </div>
          {Array.from({ length: weeks }, (_, w) => (
            <div key={w} className="grid grid-rows-7 gap-1">
              {cells.slice(w * 7, w * 7 + 7).map((r, i) =>
                r ? (
                  <button
                    key={r.key}
                    type="button"
                    disabled={!onDay}
                    onClick={() => onDay?.(r.key)}
                    title={`${fmtDate(r.key + "T00:00")}: ${fmtHours(r.battery)}`}
                    aria-label={`${fmtDate(r.key + "T00:00")}: ${t("On battery")} ${fmtHours(r.battery)}`}
                    className="size-5 rounded-sm ring-foreground/40 enabled:hover:ring-2 disabled:cursor-default"
                    style={{ background: r.battery ? `color-mix(in oklch, var(--batt) ${Math.round(20 + (r.battery / max) * 80)}%, var(--muted))` : "var(--muted)" }}
                  />
                ) : (
                  <span key={`pad-${i}`} className="size-5" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {t("Less")}
          {[0, 25, 50, 75, 100].map((p) => (
            <span key={p} className="size-3 rounded-sm" style={{ background: p ? `color-mix(in oklch, var(--batt) ${20 + p * 0.8}%, var(--muted))` : "var(--muted)" }} />
          ))}
          {t("More")} · {t("max {h}", { h: fmtHours(max) })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Battery lost across sleep/off gaps while unplugged. */
export function SleepDrainCard({ query }: { query: string }) {
  const t = useT();
  const { data: d, error } = useApi<SleepDrain>(`/api/sleep?${query}`);
  if (!d) return <StatusLine error={error} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Sleep drain")}</CardTitle>
        <CardDescription>
          {d.avgPerHour != null ? t("Average {rate}%/h lost while asleep or off, unplugged", { rate: d.avgPerHour }) : t("No unplugged sleep in this period")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {d.abnormal > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-[var(--warn)]/10 p-2 text-sm text-[var(--warn)]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("{n} sleep(s) drained faster than {rate}%/h. An app or device may be waking the laptop.", { n: d.abnormal, rate: d.threshold })}
          </p>
        )}
        {d.events.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Slept")}</TableHead>
                <TableHead>{t("Duration")}</TableHead>
                <TableHead>{t("Lost")}</TableHead>
                <TableHead>{t("Rate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.events.slice(0, 8).map((e) => (
                <TableRow key={e.start}>
                  <TableCell>
                    {bucketLabel(new Date(e.start).toLocaleDateString("sv"))} {fmtTime(e.start)}
                  </TableCell>
                  <TableCell className="tabular-nums">{e.hours}h</TableCell>
                  <TableCell className="tabular-nums">{e.lost}%</TableCell>
                  <TableCell className="tabular-nums">
                    {e.ratePerHour}%/h {e.abnormal && <Badge variant="destructive">{t("High")}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
