"use client";

import { useEffect } from "react";
import { BatteryLevelChart, DeviceCard, HealthGauge, TodayDonut } from "@/components/sections/overview";
import { UsageSection } from "@/components/sections/usage";
import { HealthSection } from "@/components/sections/health";
import { CyclesSection } from "@/components/sections/cycles";

/** Print-optimized report: every section on one page. `?print=1` opens the print dialog (Save as PDF). */
export default function ReportPage() {
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("print")) return;
    // Give the client-side fetches time to land before printing.
    const t = setTimeout(() => window.print(), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">BatteryLens report</h1>
        {/* Rendered at build time first, so the client value always differs. */}
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          Generated {new Date().toLocaleString()}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[3fr_2fr] print:grid-cols-[3fr_2fr]">
        <DeviceCard mask />
        <HealthGauge />
      </div>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr] print:grid-cols-[2fr_1fr]">
        <BatteryLevelChart />
        <TodayDonut />
      </div>
      <h2 className="print-break text-xl font-semibold">Usage — last 30 days</h2>
      <UsageSection initialRange="30d" controls={false} />
      <h2 className="print-break text-xl font-semibold">Health</h2>
      <HealthSection controls={false} />
      <h2 className="print-break text-xl font-semibold">Cycles</h2>
      <CyclesSection maxSessions={15} />
    </div>
  );
}
