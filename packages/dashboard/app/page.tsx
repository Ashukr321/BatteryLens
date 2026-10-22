import { AnomaliesCard, BatteryLevelChart, DeviceCard, HealthGauge, LiveCard, TodayDonut } from "@/components/sections/overview";

export default function OverviewPage() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
        <LiveCard />
        <HealthGauge />
        <div className="grid @xl:col-span-2 @5xl:col-span-1">
          <TodayDonut />
        </div>
      </div>
      <div className="grid gap-4 @4xl:grid-cols-[2fr_1fr]">
        <BatteryLevelChart />
        <DeviceCard />
      </div>
      <AnomaliesCard />
    </div>
  );
}
