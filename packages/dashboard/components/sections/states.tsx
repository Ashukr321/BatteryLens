import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton, or an error line when the local API is unreachable. */
export function StatusLine({ error }: { error: string | null }) {
  if (error)
    return (
      <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
        Couldn&apos;t reach the BatteryLens server ({error}). Is <code>npx batterylens</code> still running?
      </div>
    );
  return <Skeleton className="h-48 w-full rounded-xl" />;
}

export function EmptyState() {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
      <p>No data for this period yet.</p>
      <p>
        Run <code className="rounded bg-muted px-1">npx batterylens install</code> to record history in the background.
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
