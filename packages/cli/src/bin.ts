#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import open from 'open';
import pc from 'picocolors';
import { getAdapter } from './adapters/index.js';
import { bootstrap, collectorPid, startCollector } from './collector.js';
import { clearAll, dataStats, pruneIfNewDay, readConfig, readDevice, readSamples, saveDevice } from './store.js';
import { usage } from './analytics.js';
import { listen } from './server.js';
import { install, uninstall } from './scheduler.js';
import { findBrowser, renderPdf } from './pdf.js';

// Single source of truth for the version: the package.json that ships with dist/.
const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const program = new Command('batterylens').description('One command. Full battery story.').version(version);
const fmtH = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

async function serve(port: number) {
  const adapter = getAdapter();
  const imported = await bootstrap(adapter);
  if (imported) console.log(pc.dim(`Imported ${imported} samples from OS history.`));
  pruneIfNewDay();
  // Without the background collector, sample while the dashboard is open.
  if (!collectorPid()) await startCollector(adapter);
  const s = await listen(adapter, port);
  return { ...s, url: `http://127.0.0.1:${s.port}` };
}

program
  .command('start', { isDefault: true })
  .description('Start the dashboard and open it in the browser')
  .option('-p, --port <port>', 'port', (v) => parseInt(v, 10), readConfig().port ?? 4545)
  .option('--no-open', "don't open the browser")
  .action(async (o) => {
    const { url } = await serve(o.port);
    console.log(`${pc.green('🔋 BatteryLens')} running at ${pc.cyan(url)}  ${pc.dim('(Ctrl+C to stop)')}`);
    if (!readConfig().installed) console.log(pc.yellow('Tip: run `npx batterylens install` to record history in the background.'));
    if (o.open) await open(url);
  });

program
  .command('collect')
  .description('Run the background collector (used by install)')
  .action(async () => {
    if (!(await startCollector())) { console.log('Collector already running.'); process.exit(0); }
  });

program
  .command('install')
  .description('Install the background collector (starts at login)')
  .action(async () => {
    const d = await getAdapter().device();
    if (!d) { console.error(pc.red('No battery found on this machine.')); process.exit(1); }
    saveDevice(d);
    install();
    console.log(pc.green('✔ Collector installed. It records a sample every minute and starts at login.'));
  });

program
  .command('uninstall')
  .description('Remove the background collector')
  .option('--purge', 'also delete all recorded data')
  .action(async (o) => {
    uninstall();
    console.log(pc.green('✔ Collector removed.'));
    if (o.purge && (await confirmDelete())) { clearAll(); console.log(pc.green('✔ Data deleted.')); }
  });

program
  .command('status')
  .description('Quick summary in the terminal')
  .action(async () => {
    const adapter = getAdapter();
    const [s, d] = await Promise.all([adapter.sample(), readDevice() ?? adapter.device()]);
    adapter.close?.();
    if (!s || !d) { console.log('No battery found on this machine.'); return; }
    const design = d.battery.designCapacity;
    const health = s.fullChargeCapacity && design ? `${((s.fullChargeCapacity / design) * 100).toFixed(1)}%` : 'n/a';
    const cycles = s.cycleCount ? `${s.cycleCount}/${d.battery.designCycleCount ?? 500}` : 'not reported';
    const midnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const today = usage(readSamples(midnight), midnight, Date.now()).totals;
    const state = s.charging ? pc.yellow('⚡ charging') : s.acConnected ? pc.cyan('🔌 plugged') : pc.green('🔋 on battery');
    console.log(`🔋 ${pc.bold(`${s.percent}%`)} ${state}   Health ${pc.bold(health)}   Cycles ${cycles}   Today: ${fmtH(today.plugged)} plugged · ${fmtH(today.battery)} battery`);
    console.log(pc.dim(`${d.laptopManufacturer} ${d.laptopModel} · ${d.os} · collector ${collectorPid() ? 'running' : 'not running'} · ${dataStats().days} days stored`));
  });

program
  .command('clear')
  .description('Delete all recorded data')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action(async (o) => {
    if (!o.yes && !(await confirmDelete())) { console.log('Cancelled. Nothing was deleted.'); return; }
    clearAll();
    console.log(pc.green('✔ All records cleared. New data recording continues if the collector is running.'));
  });

program
  .command('report')
  .description('Generate a PDF report using Chrome/Edge headless')
  .option('--pdf [file]', 'output PDF path', 'batterylens-report.pdf')
  .action(async (o) => {
    if (!findBrowser()) { console.error(pc.red('Chrome or Edge not found. Open the dashboard and use "Export PDF" instead.')); process.exit(1); }
    const { server, url } = await serve(readConfig().port ?? 4545);
    const out = path.resolve(typeof o.pdf === 'string' ? o.pdf : 'batterylens-report.pdf');
    try {
      await renderPdf(`${url}/report/`, out);
    } catch (e: any) {
      console.error(pc.red(e.message));
      process.exit(1);
    }
    server.close();
    console.log(pc.green(`✔ Saved ${out}`));
    process.exit(0);
  });

async function confirmDelete() {
  const st = dataStats();
  console.log(pc.yellow(`⚠  This permanently deletes ${st.days} days of data (${st.sizeMB} MB, ${st.samples} samples).`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type DELETE to confirm: ');
  rl.close();
  return answer.trim() === 'DELETE';
}

program.parseAsync().catch((e) => { console.error(pc.red(e.message)); process.exit(1); });
