"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";

/** Loading skeleton, or an error line when the local API is unreachable. */
export function StatusLine({ error }: { error: string | null }) {
  const t = useT();
  if (error)
    return (
      <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
        {t("Couldn't reach the BatteryLens server ({error}). Is npx batterylens still running?", { error })}
      </div>
    );
  return <Skeleton className="h-48 w-full rounded-xl" />;
}

export function EmptyState() {
  const t = useT();
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
      <p>{t("No data for this period yet.")}</p>
      <p>
        {t("Run this to record history in the background:")} <code className="rounded bg-muted px-1">npx batterylens install</code>
      </p>
    </div>
  );
}

/** Vertical fade used under area charts; place inside <defs>. */
export function Gradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={color} stopOpacity={0.45} />
      <stop offset="95%" stopColor={color} stopOpacity={0.03} />
    </linearGradient>
  );
}
