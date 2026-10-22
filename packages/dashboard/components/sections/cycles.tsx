"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, StatusLine } from "@/components/sections/states";
import { bucketLabel, fmtTime, useApi, type Cycles } from "@/lib/api";

const config = { count: { label: "Full charges", color: "var(--plug)" } } satisfies ChartConfig;

type Session = Cycles["sessions"][number];
type SortKey = "start" | "minutes" | "gained" | "ratePerHour";

export function CyclesSection({ maxSessions }: { maxSessions?: number }) {
  const { data: c, error } = useApi<Cycles>("/api/cycles?range=30d");
  if (!c) return <StatusLine error={error} />;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <Card size="sm">
          <CardHeader>
            <CardDescription>OS cycle count</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {c.osCycleCount ?? "Not reported"}
              <span className="text-base font-normal text-muted-foreground"> / {c.designCycleCount}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <Progress value={Math.min(100, c.cycleLifeUsed ?? 0)} />
            <p className="text-xs text-muted-foreground">
              {c.osCycleCount == null
                ? "Hardware doesn't report cycles — see equivalent cycles."
                : `${c.cycleLifeUsed}% of rated cycle life used${c.designCycleAssumed ? " (500 assumed; OS doesn't report the rating)" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Metric label="Full charges (30d)" value={c.fullCharges} />
        <Metric label="Equivalent cycles (30d)" value={c.equivalentCycles} />
        <Metric label="Charge sessions (30d)" value={c.sessions.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Full charges per day</CardTitle>
          <CardDescription>Reached ≥ 99% after being below 95%</CardDescription>
        </CardHeader>
        <CardContent>
          {c.fullChargesPerDay.length === 0 ? (
            <EmptyState />
          ) : (
            <ChartContainer config={config} className="h-56 w-full">
              <BarChart data={c.fullChargesPerDay} margin={{ left: -24, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickFormatter={bucketLabel} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(k) => bucketLabel(String(k))} />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <SessionsTable sessions={c.sessions} max={maxSessions} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function SessionsTable({ sessions, max }: { sessions: Session[]; max?: number }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "start", desc: true });
  const [minPercent, setMinPercent] = useState("");

  const rows = useMemo(() => {
    const val = (s: Session) => (sort.key === "gained" ? s.endPercent - s.startPercent : s[sort.key]);
    return sessions
      .filter((s) => !minPercent || s.endPercent - s.startPercent >= +minPercent)
      .sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)))
      .slice(0, max);
  }, [sessions, sort, minPercent, max]);

  const head = (key: SortKey, label: string) => (
    <TableHead>
      <Button variant="ghost" size="sm" className="-ml-2.5 print:hidden" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}>
        {label} <ArrowUpDown />
      </Button>
      <span className="hidden print:inline">{label}</span>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Charge sessions</CardTitle>
        <CardDescription>Plug-in to unplug</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!max && (
          <Input type="number" min={0} max={100} placeholder="Min % gained" value={minPercent} onChange={(e) => setMinPercent(e.target.value)} className="w-40" aria-label="Minimum percent gained" />
        )}
        <Table>
          <TableHeader>
            <TableRow>
              {head("start", "Started")}
              <TableHead>Start → End</TableHead>
              {head("gained", "Gained")}
              {head("minutes", "Duration")}
              {head("ratePerHour", "Rate")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.start}>
                <TableCell>
                  {bucketLabel(new Date(s.start).toLocaleDateString("sv"))} {fmtTime(s.start)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {s.startPercent}% → {s.endPercent}%
                </TableCell>
                <TableCell className="tabular-nums">{s.endPercent - s.startPercent > 0 ? "+" : ""}{s.endPercent - s.startPercent}%</TableCell>
                <TableCell className="tabular-nums">{s.minutes >= 60 ? `${Math.floor(s.minutes / 60)}h ${s.minutes % 60}m` : `${s.minutes}m`}</TableCell>
                <TableCell className="tabular-nums">{s.ratePerHour}%/h</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No charge sessions.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
