"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusLine } from "@/components/sections/states";
import { fmtDate, sessionToken, useApi, type DataStats } from "@/lib/api";

const CSV_URL = "/api/samples?format=csv";

export default function SettingsPage() {
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
      toast.success("All records cleared. New data recording started.");
      setOpen(false);
      setConfirm("");
      reload();
    } catch (e) {
      toast.error(`Clear failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <StatusLine error={error} />;
  const summary = `${st.days} days · ${st.sizeMB} MB · ${st.samples.toLocaleString()} samples`;

  return (
    <div className="grid max-w-2xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Stored data</CardTitle>
          <CardDescription>Kept on this laptop only. The last 30 days are kept; older days are deleted automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p>{summary}</p>
          {st.oldest && (
            <p className="text-muted-foreground">
              {fmtDate(st.oldest + "T00:00")} → {fmtDate(st.newest + "T00:00")}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" nativeButton={false} render={<a href={CSV_URL} download="batterylens-samples.csv" />}>
            <Download /> Export CSV
          </Button>
        </CardFooter>
      </Card>

      <Card className="ring-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Deletes all recorded samples and logs. Settings are kept and the collector keeps recording.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Dialog open={open} onOpenChange={(o) => (setOpen(o), setConfirm(""))}>
            <DialogTrigger render={<Button variant="destructive" />}>
              <Trash2 /> Clear all records
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all records?</DialogTitle>
                <DialogDescription>This permanently deletes {summary}. It can&apos;t be undone.</DialogDescription>
              </DialogHeader>
              <Button variant="outline" nativeButton={false} render={<a href={CSV_URL} download="batterylens-samples.csv" />}>
                <Download /> Export CSV first
              </Button>
              <label className="grid gap-2 text-sm">
                <span>
                  Type <b>DELETE</b> to confirm
                </span>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="DELETE" />
              </label>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button variant="destructive" disabled={confirm !== "DELETE" || busy} onClick={clearAll}>
                  {busy ? "Clearing…" : "Clear all records"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}
