import { BatteryLevelChart, DeviceCard, HealthGauge, LiveCard, TodayDonut } from "@/components/sections/overview";

export default function OverviewPage() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <LiveCard />
        <HealthGauge />
        <TodayDonut />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <BatteryLevelChart />
        <DeviceCard />
      </div>
    </div>
  );
}
