"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusLine } from "@/components/sections/states";
import { fmtDate, sessionToken, useApi, type AlertConfig, type DataStats } from "@/lib/api";
import { useT } from "@/lib/i18n";

const CSV_URL = "/api/samples?format=csv";
const JSON_URL = "/api/samples";

export default function SettingsPage() {
  const t = useT();
  const { data: st, error, reload } = useApi<DataStats>("/api/data/stats");
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function clearAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/data/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm, token: sessionToken() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      toast.success(t("All records cleared. New data recording started."));
      setOpen(false);
      setConfirm("");
      reload();
    } catch (e) {
      toast.error(t("Clear failed: {error}", { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <StatusLine error={error} />;
  const summary = t("{days} days · {mb} MB · {samples} samples", { days: st.days, mb: st.sizeMB, samples: st.samples.toLocaleString() });

  return (
    <div className="grid max-w-2xl gap-4">
      <AlertsCard />

      <Card>
        <CardHeader>
          <CardTitle>{t("Stored data")}</CardTitle>
          <CardDescription>{t("Kept on this laptop only. The last 30 days are kept; older days are deleted automatically.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p>{summary}</p>
          {st.oldest && (
            <p className="text-muted-foreground">
              {fmtDate(st.oldest + "T00:00")} → {fmtDate(st.newest + "T00:00")}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={CSV_URL} download="batterylens-samples.csv" />}>
            <Download /> {t("Export CSV")}
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={JSON_URL} download="batterylens-samples.json" />}>
            <Download /> {t("Export JSON")}
          </Button>
        </CardFooter>
      </Card>

      <Card className="ring-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t("Danger zone")}</CardTitle>
          <CardDescription>{t("Deletes all recorded samples and logs. Settings are kept and the collector keeps recording.")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Dialog open={open} onOpenChange={(o) => (setOpen(o), setConfirm(""))}>
            <DialogTrigger render={<Button variant="destructive" />}>
              <Trash2 /> {t("Clear all records")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Clear all records?")}</DialogTitle>
                <DialogDescription>{t("This permanently deletes {summary}. It can't be undone.", { summary })}</DialogDescription>
              </DialogHeader>
              <Button variant="outline" nativeButton={false} render={<a href={CSV_URL} download="batterylens-samples.csv" />}>
                <Download /> {t("Export CSV first")}
              </Button>
              <label className="grid gap-2 text-sm">
                <span>{t("Type DELETE to confirm")}</span>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="DELETE" />
              </label>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>{t("Cancel")}</DialogClose>
                <Button variant="destructive" disabled={confirm !== "DELETE" || busy} onClick={clearAll}>
                  {busy ? t("Clearing…") : t("Clear all records")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}

function AlertsCard() {
  const { data, error } = useApi<{ alerts: AlertConfig }>("/api/settings");
  if (!data) return <StatusLine error={error} />;
  // Mounted only after the load, so the form starts from the saved values without syncing state in an effect.
  return <AlertsForm initial={data.alerts} />;
}

function AlertsForm({ initial }: { initial: AlertConfig }) {
  const t = useT();
  const [a, setA] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<AlertConfig>) => setA((x) => ({ ...x, ...patch }));
  const num = (k: "high" | "low" | "hotC") => ({ value: a[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: parseInt(e.target.value, 10) || 0 }) });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alerts: a, token: sessionToken() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setA(body.alerts);
      toast.success(t("Alert settings saved."));
    } catch (e) {
      toast.error(t("Couldn't save: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" /> {t("Smart alerts")}
        </CardTitle>
        <CardDescription>{t("Desktop notifications from the background collector (run npx batterylens install).")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-[var(--batt)]" checked={a.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {t("Enable alerts")}
        </label>
        <fieldset disabled={!a.enabled} className="grid gap-3 disabled:opacity-50 @md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-muted-foreground">{t("Unplug alert at (%)")}</span>
            <Input type="number" min={50} max={100} {...num("high")} />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">{t("Plug-in alert at (%)")}</span>
            <Input type="number" min={5} max={50} {...num("low")} />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">{t("Hot battery alert (°C)")}</span>
            <Input type="number" min={30} max={70} {...num("hotC")} />
          </label>
          <label className="flex items-center gap-2 @md:col-span-3">
            <input type="checkbox" className="size-4 accent-[var(--batt)]" checked={a.weekly} onChange={(e) => set({ weekly: e.target.checked })} />
            {t("Weekly summary every Monday")}
          </label>
        </fieldset>
        <p className="text-xs text-muted-foreground">{t("Fast sleep drain is always reported while alerts are on.")}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={saving}>
          {saving ? t("Saving…") : t("Save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
