# BatteryLens: Implementation Plan

## 1. Sabse important baat (pehle samjho)

Koi bhi OS "pichhle 30 din me kitne ghante charger pe tha" ka clean data seedha nahi deta. Isliye package ke **do hisse** honge:

1. **Collector (background)**: har 60 second me battery ka sample (%, charging hai ya nahi, capacity, cycle count...) local file me save karta hai. Login par khud start hota hai.
2. **Dashboard (on-demand)**: `npx batterylens` chalane par local server start hota hai, saved samples se 24h/7d/14d/30d/monthly reports banake Recharts se dikhata hai.

**Pehle din bhi khaali dashboard na dikhe**, isliye first run par OS ki existing history import karenge:
- Windows: `powercfg /batteryreport` me ~3 din ki detailed "Recent usage" (AC vs battery) aur lambi capacity history hoti hai.
- macOS: `pmset -g log` me AC/Battery switch events kuch din ke milte hain.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    npx batterylens                       │
│                                                          │
│  ┌───────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ Collector │──▶│ Local store  │◀──│  HTTP server    │  │
│  │ (60s loop)│   │ ~/.batterylens│   │ 127.0.0.1:4545  │  │
│  └─────┬─────┘   └──────────────┘   │  /api/*  JSON   │  │
│        │                            │  /  → Next.js   │  │
│  ┌─────▼──────────────┐             │  static export  │  │
│  │ OS adapters        │             └────────┬────────┘  │
│  │ windows.ts         │                      │           │
│  │ macos.ts           │             ┌────────▼────────┐  │
│  │ (linux.ts later)   │             │ Browser: Next.js│  │
│  └────────────────────┘             │ + Recharts      │  │
│                                     └─────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Next.js ko npm package me kaise ship karein

Do options:

| Option | Kaise | Pros | Cons |
|---|---|---|---|
| **A (recommended)** | `next.config.js` me `output: 'export'`, build ka `out/` folder package me copy. CLI ka chhota Node HTTP server static files + `/api/*` serve kare | Package chhota, fast start, Next runtime ki zarurat nahi | Next API routes / SSR use nahi kar sakte (zarurat bhi nahi) |
| B | `output: 'standalone'`, CLI `node .next/standalone/server.js` spawn kare | Full Next features | Package bada (~30–60 MB), start slow |

Option A lo. Dashboard sirf client-side fetch karega: `fetch('/api/usage?range=30d')`.

---

## 3. Folder structure (monorepo)

```
batterylens/
├─ package.json                # workspaces root
├─ pnpm-workspace.yaml
├─ README.md
├─ IMPLEMENTATION_PLAN.md
├─ FEATURES.md
├─ packages/
│  ├─ cli/                     # ← yahi npm par publish hoga
│  │  ├─ package.json          # "bin": { "batterylens": "dist/bin.js" }
│  │  ├─ src/
│  │  │  ├─ bin.ts             # arg parsing (commander)
│  │  │  ├─ commands/
│  │  │  │  ├─ start.ts        # server + open browser
│  │  │  │  ├─ install.ts      # collector ko OS scheduler me register
│  │  │  │  ├─ uninstall.ts
│  │  │  │  ├─ collect.ts      # 60s loop (collector process)
│  │  │  │  ├─ status.ts       # terminal summary
│  │  │  │  ├─ clear.ts        # confirm prompt → clear all records
│  │  │  │  └─ report.ts       # headless PDF
│  │  │  ├─ adapters/
│  │  │  │  ├─ index.ts        # process.platform se adapter choose
│  │  │  │  ├─ windows.ts
│  │  │  │  ├─ macos.ts
│  │  │  │  └─ types.ts
│  │  │  ├─ store/
│  │  │  │  ├─ writer.ts       # JSONL append
│  │  │  │  ├─ reader.ts       # range query
│  │  │  │  ├─ retention.ts    # 30-day rolling prune
│  │  │  │  └─ clear.ts        # clear all records
│  │  │  ├─ analytics/
│  │  │  │  ├─ usage.ts        # plugged vs battery hours
│  │  │  │  ├─ cycles.ts       # full charges, equivalent cycles
│  │  │  │  └─ health.ts       # health %, trend, forecast
│  │  │  ├─ scheduler/
│  │  │  │  ├─ windows-task.ts # schtasks
│  │  │  │  └─ macos-launchd.ts
│  │  │  └─ server/
│  │  │     ├─ index.ts        # node:http, static + api router
│  │  │     └─ routes.ts
│  │  └─ dashboard/            # build time pe Next export yahan copy hota hai
│  └─ dashboard/               # Next.js app (development)
│     ├─ next.config.js        # output: 'export'
│     ├─ app/
│     │  ├─ layout.tsx         # ThemeProvider
│     │  ├─ page.tsx           # Overview
│     │  ├─ usage/page.tsx
│     │  ├─ health/page.tsx
│     │  └─ cycles/page.tsx
│     ├─ components/
│     │  ├─ charts/            # Recharts wrappers
│     │  ├─ DeviceCard.tsx
│     │  ├─ RangeTabs.tsx      # 24h | 7d | 14d | 30d | Monthly
│     │  ├─ ThemeSwitcher.tsx
│     │  └─ ExportPdfButton.tsx
│     └─ styles/themes.css
└─ fixtures/                   # tests ke liye real powercfg XML / ioreg outputs
```

---

## 4. Data collection: OS-wise

Sab adapters ek hi shape return karein:

```ts
// adapters/types.ts
export interface DeviceInfo {
  userName: string;            // os.userInfo().username
  computerName: string;
  laptopModel: string;         // "HP Pavilion 15", "MacBook Air (M2, 2022)"
  laptopManufacturer: string;
  os: string;                  // "Windows 11 23H2", "macOS 15.1"
  battery: {
    manufacturer?: string;     // "SMP", "Sunwoda", "LGC"...
    model?: string;            // DeviceName / Battery Id
    serial?: string;
    chemistry?: string;        // "LION", "LiP"
    manufactureDate?: string;  // ISO, agar OS de
    firstSeenDate: string;     // hamara pehla sample (fallback "first use")
    designCapacity: number;    // mWh (Windows) / mAh (mac) — unit bhi store karo
    capacityUnit: 'mWh' | 'mAh';
    designCycleCount?: number; // mac: usually 1000
  };
}

export interface Sample {
  ts: number;                  // epoch ms
  percent: number;             // 0–100
  acConnected: boolean;        // charger laga hai?
  charging: boolean;           // actually charge ho raha hai?
  fullChargeCapacity?: number;
  cycleCount?: number;
  temperatureC?: number;
  voltageMv?: number;
  adapterWatts?: number;       // mac pe milta hai
}
```

### 4.1 Windows

| Data | Source |
|---|---|
| Design capacity, full charge capacity, cycle count, manufacturer, serial, chemistry, manufacture date | `powercfg /batteryreport /xml /output %TEMP%\bl.xml` → `fast-xml-parser` se parse. Battery node me `DesignCapacity`, `FullChargeCapacity`, `CycleCount`, `Manufacturer`, `SerialNumber`, `Chemistry`, `ManufactureDate` |
| Purani history (bootstrap) | Usi XML me `RecentUsage` (~3 din, AC/DC entries + charge) aur `History` (capacity over time) |
| Live %, AC connected | PowerShell: `Get-CimInstance Win32_Battery` → `EstimatedChargeRemaining`, `BatteryStatus` (2 = AC pe). Detailed: `Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus` → `PowerOnline`, `Charging`, `Voltage` |
| Laptop model | `Get-CimInstance Win32_ComputerSystem` → `Manufacturer`, `Model` (`wmic` deprecated hai, use mat karo) |
| User name | `os.userInfo().username` |

Notes:
- `powercfg /batteryreport` normally admin ke bina chalta hai, par har 60s nahi chalana (slow hai). Ise **har 6 ghante** chalao (capacity/cycle ke liye); live % ke liye CIM query har minute.
- PowerShell har minute spawn karna heavy hai. Collector me **ek persistent PowerShell process** rakho jo stdin se command le aur JSON return kare.
- Kuch laptops (especially purane/cheap) `CycleCount` 0 ya missing dete hain → UI me "Not reported by hardware" dikhao, aur apna calculated cycle count dikhao (section 6).

### 4.2 macOS

| Data | Source |
|---|---|
| Live %, charging, AC, temperature, voltage, capacity, cycle count | `ioreg -arn AppleSmartBattery` (XML plist) → `plist` package se parse. Keys: `CurrentCapacity`, `MaxCapacity`, `AppleRawMaxCapacity`, `DesignCapacity`, `CycleCount`, `DesignCycleCount9C`, `ExternalConnected`, `IsCharging`, `FullyCharged`, `Temperature` (÷100 = °C), `Voltage`, `BatterySerialNumber`, `DeviceName`, `ManufactureDate`, `AdapterDetails.Watts` |
| Condition, max capacity % | `system_profiler SPPowerDataType -json` |
| Bootstrap history | `pmset -g log` → "Using AC" / "Using Batt" lines se transitions |
| Laptop model | `system_profiler SPHardwareDataType -json` → `machine_name`, `machine_model`; `scutil --get ComputerName` |

Notes:
- Apple Silicon pe `CurrentCapacity`/`MaxCapacity` percent me aate hain; mAh values `AppleRaw*` keys me. Intel Macs pe alag. Adapter me dono handle karo, fixtures dono ke rakho.
- `ManufactureDate` encoded integer hota hai (model ke hisaab se format alag). Decode na ho to `firstSeenDate` fallback.
- Battery "manufacturer" Macs pe aksar hidden/missing hota hai; `DeviceName` (jaise battery pack model) dikhao.

### 4.3 Linux (Phase 4, bonus)
`/sys/class/power_supply/BAT0/` → `capacity`, `status`, `energy_full`, `energy_full_design`, `cycle_count`, `manufacturer`, `model_name`.

---

## 5. Storage

Native modules (`better-sqlite3`) `npx` pe Windows/mac par compile issues dete hain, isliye **zero-native-dependency** approach:

```
~/.batterylens/
├─ config.json            # port, theme, install path, lastPruneDate
├─ device.json            # DeviceInfo cache
├─ app/                   # installed copy of package (npx cache clear hone pe bhi chale)
├─ logs/
│  └─ 2026-10-22.log      # collector logs, ek file per din
└─ data/
   ├─ 2026-09-23.jsonl    # sabse purana din (30 din pehle)
   ├─ ...
   └─ 2026-10-22.jsonl    # aaj (ek line = ek Sample)
```

- **Ek file = ek din** (local date ke hisaab se). Isse purana din hatana sirf ek file delete karna hai, poori file rewrite nahi karni padti.
- Size: ~1440 samples/day × ~120 bytes ≈ 170 KB/day → 30 din ≈ **5 MB max**. Disk kabhi nahi bharegi.
- "Monthly" view ka matlab = **last 30 days (rolling)**.

### 5.1 30-day rolling retention (auto cleanup)

Rule: hamesha **aaj + pichhle 29 din = 30 din** rakho. 31va din aate hi sabse purani file (day 1) delete.

```
Day 30:  [Sep 23 ... Oct 22]          → 30 files
Day 31:  [Sep 23] ✗ delete  → [Sep 24 ... Oct 23]  → phir 30 files
```

```ts
// store/retention.ts
const KEEP_DAYS = 30;

export function pruneOldData(baseDir: string, now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (KEEP_DAYS - 1));
  for (const dir of ['data', 'logs']) {
    const full = path.join(baseDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      const m = /^(\d{4})-(\d{2})-(\d{2})\.(jsonl|log)$/.exec(f);
      if (!m) continue;                                   // unknown files ko mat chhuo
      const day = new Date(+m[1], +m[2] - 1, +m[3]);
      if (day < cutoff) fs.rmSync(path.join(full, f), { force: true });
    }
  }
}
```

**"Cron job" kahan chalega?** Alag OS cron ki jagah cleanup **collector ke andar** hi chalega, kyunki:
- Windows me `cron` hota hi nahi; extra scheduled task = extra cheez jo toot sakti hai.
- Laptop raat 12 baje aksar sleep/band hota hai, to fixed-time cron miss ho jaata hai.

Isliye collector teen jagah prune karega:
1. **Collector start hote hi** (login / reboot ke baad).
2. **Har 60s ke loop me date change check**: agar `today !== config.lastPruneDate` → `pruneOldData()` chalao aur `lastPruneDate` update karo. Laptop midnight ke time sleep me tha to bhi wake hote hi cleanup ho jaayega.
3. **Dashboard start (`npx batterylens`) pe bhi** ek baar, agar collector install hi nahi kiya.

Safety: `reader.ts` bhi hamesha sirf last 30 din ki files padhe, taaki prune kisi wajah se late ho to bhi dashboard me 30 din se zyada na dikhe.

### 5.2 Clear all records (confirmation ke saath)

**Kya delete hoga:** `data/` aur `logs/` ke saare files + `device.json` ka `firstSeenDate` reset.
**Kya rahega:** `config.json` (theme, port) aur `app/`, taaki collector chalta rahe aur turant naya data save karna shuru kar de.

**Dashboard (Settings page → Danger zone):**
1. Red button **"Clear all records"**.
2. Confirmation modal me dikhao: kitne din ka data aur kitne MB delete honge ("30 days · 4.8 MB · 41,230 samples").
3. Modal me **"Export CSV first"** button (galti se data na jaaye).
4. Confirm button tab tak disabled jab tak user input box me `DELETE` type na kare.
5. Confirm → `POST /api/data/clear` body `{ "confirm": "DELETE", "token": "<session token>" }`.
6. Success toast: "All records cleared. New data recording started." Charts empty state me chale jaayein.

**Server-side checks** (zaroori, kyunki koi bhi website browser se `localhost:4545` pe request bhej sakti hai):
- `confirm === "DELETE"` na ho to `400`.
- Server start pe ek random token banao (`crypto.randomUUID()`), sirf dashboard HTML me inject karo; token match na ho to `403`.
- `Origin` header `http://127.0.0.1:<port>` / `http://localhost:<port>` na ho to `403`.
- Delete ke time collector ka append chal raha ho to koi dikkat nahi: `appendFileSync` agle sample pe nayi file bana dega.

**CLI:**
```bash
npx batterylens clear
# ⚠  Ye 30 days ka data (4.8 MB) permanently delete kar dega.
# Confirm karne ke liye DELETE type karo: _

npx batterylens clear --yes   # scripts ke liye, bina prompt
```
`node:readline/promises` se prompt; input `DELETE` na ho to "Cancelled. Kuch delete nahi hua." print karke exit.
- Alternative: Node ≥ 22.13 ka built-in `node:sqlite` (no native install). Abhi experimental warning deta hai, isliye v1 me JSONL safer hai.

---

## 6. Analytics logic

### 6.1 Charger vs battery hours
```ts
// consecutive samples ke beech ka time us state ko do
for (i = 1; i < samples.length; i++) {
  const gap = samples[i].ts - samples[i-1].ts;
  if (gap > 3 * 60_000) { sleepOrOff += gap; continue; } // laptop band/sleep
  if (samples[i-1].acConnected) pluggedMs += gap; else batteryMs += gap;
}
```
Ranges: 24h, 7d, 14d, 30d, calendar month. Har din ka breakdown bhi (stacked bar chart ke liye).

### 6.2 Cycles
- **OS cycle count**: hardware se (most accurate jab available ho).
- **Full charges**: kitni baar % `≥ 99` tak pahuncha jab pichhli baar `< 95` tha (hysteresis taaki 99↔100 flicker double count na ho).
- **Equivalent full cycles (calculated)**: total discharge % ka sum ÷ 100. (Jaise 50% + 50% = 1 cycle.) Ye un laptops ke liye kaam aata hai jo CycleCount nahi dete.
- **Charge sessions**: plug-in se unplug tak: start %, end %, duration, avg rate.

### 6.3 Health
- `health% = fullChargeCapacity / designCapacity × 100`
- 30-day trend line + simple linear regression se **forecast**: "Is rate se 80% health ~Aug 2027 tak".
- Cycle life used: `cycleCount / designCycleCount` (mac pe 1000 typical; Windows pe unknown ho to 500 assume karke clearly label karo).

---

## 7. API endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/device` | DeviceInfo (laptop, user, battery model, manufacturer, dates) |
| `GET /api/live` | Latest sample (Server-Sent Events `/api/live/stream` se real-time) |
| `GET /api/health?range=30d` | health% series + forecast |
| `GET /api/usage?range=24h\|7d\|14d\|30d\|month&month=2026-10` | plugged/battery/off totals + per-day/per-hour breakdown |
| `GET /api/cycles?range=30d` | OS cycle count, full charges, equivalent cycles, charge sessions |
| `GET /api/samples?from=&to=` | raw samples (CSV/JSON export ke liye) |
| `GET /api/data/stats` | stored days, oldest/newest date, size MB, sample count (clear modal ke liye) |
| `POST /api/data/clear` | saara data delete; `confirm: "DELETE"` + session token + same-origin zaroori |

Server sirf `127.0.0.1` pe bind ho (LAN se koi access na kare).

---

## 8. Dashboard (Next.js + Recharts)

### Pages & charts

**Overview (`/`)**
- Device card: 👤 user name · 💻 laptop model · 🔋 battery manufacturer/model/serial · 📅 manufacture date / first seen · OS
- Health gauge: `RadialBarChart` (green > 80%, amber 60–80, red < 60)
- Live battery: % + charging animation + temperature + adapter watts
- 24h battery level: `AreaChart` (x = time, y = %), charger-connected periods ko `ReferenceArea` se shade karo
- Today summary: plugged hours vs battery hours `PieChart` (donut)

**Usage (`/usage`)**
- Range tabs: 24h | 7d | 14d | 30d | Monthly (month picker)
- Stacked `BarChart`: har din plugged / battery / sleep-off hours
- 24h ke liye hourly heatmap (custom grid ya `BarChart`)
- Totals cards: "Is week 31h charger pe, 12h battery pe"

**Health (`/health`)**
- `LineChart`: health% over 30 days / all time + dashed forecast line
- Design vs full charge capacity `ComposedChart`

**Cycles (`/cycles`)**
- Big number: cycle count / design cycles + progress bar
- Full charges per day `BarChart`
- Charge sessions table (start %, end %, duration, sort/filter)

Interactivity: Recharts `Tooltip`, `Brush` (zoom/pan on long ranges), legend click se series hide/show, chart pe click karke us din ki detail drawer.

### Themes: Light / Dark / Night Owl
`next-themes` with `themes={['light','dark','night-owl']}`, `attribute="data-theme"`. CSS variables:

```css
:root[data-theme="light"]     { --bg:#ffffff; --card:#f6f7f9; --text:#111827; --muted:#6b7280; --plug:#2563eb; --batt:#16a34a; --warn:#d97706; --bad:#dc2626; }
:root[data-theme="dark"]      { --bg:#0b0f14; --card:#141a22; --text:#e5e7eb; --muted:#9ca3af; --plug:#60a5fa; --batt:#4ade80; --warn:#fbbf24; --bad:#f87171; }
:root[data-theme="night-owl"] { --bg:#011627; --card:#0b2942; --text:#d6deeb; --muted:#5f7e97; --plug:#82aaff; --batt:#addb67; --warn:#ecc48d; --bad:#ef5350; --accent:#c792ea; }
```
Recharts colors me `var(--plug)` etc. pass karo taaki charts bhi theme follow karein. Default: system preference (`prefers-color-scheme`).

### PDF export
- **v1 (zero deps, best quality):** `@media print` stylesheet + "Export PDF" button → `window.print()`. Browser ka "Save as PDF" vector charts deta hai (Recharts SVG hai, sharp rahega). Print CSS me nav/buttons hide, page breaks set, light colors force.
- **v1.1:** `jspdf` + `svg2pdf.js` se direct download (cover page: device info, health score, summary tables).
- **CLI `report --pdf`:** optional, agar user ke paas Chrome/Edge hai to `--headless --print-to-pdf` use karo (puppeteer bundle mat karo, bahut heavy hai).

---

## 9. Background collector install

`install` command:
1. Package ko `~/.batterylens/app` me copy karo (npx cache clear hone pe bhi chale).
2. `process.execPath` (node ka full path) save karo.
3. OS scheduler me register:

**Windows**: Task Scheduler, login pe start, long-running:
```
schtasks /Create /TN "BatteryLens" /SC ONLOGON /RL LIMITED /F ^
  /TR "\"C:\...\wscript.exe\" \"%USERPROFILE%\.batterylens\app\hidden.vbs\""
```
`hidden.vbs` node ko bina console window ke chalata hai (warna har login pe black window flash hogi). Install ke turant baad `schtasks /Run /TN BatteryLens`.

**macOS**: LaunchAgent `~/Library/LaunchAgents/com.batterylens.collector.plist`:
```xml
<key>ProgramArguments</key>
<array><string>/path/to/node</string><string>~/.batterylens/app/dist/bin.js</string><string>collect</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
```
Load: `launchctl bootstrap gui/$(id -u) <plist>`. Admin/sudo ki zarurat nahi.

Collector: setInterval 60s, sleep/wake detect (gap > 3 min), crash pe log `~/.batterylens/collector.log`, ek hi instance chale (lock file).

`uninstall`: task/agent hatao, `--purge` diya ho to data bhi delete (user se confirm karke).

---

## 10. Dependencies

CLI: `commander`, `open`, `fast-xml-parser`, `plist`, `picocolors`, `get-port` (agar 4545 busy ho). Node ≥ 20.
Dashboard: `next`, `react`, `recharts`, `next-themes`, `tailwindcss`, `date-fns`, `lucide-react`, (later) `jspdf`, `svg2pdf.js`.

`package.json` (cli):
```json
{
  "name": "batterylens",
  "bin": { "batterylens": "dist/bin.js" },
  "files": ["dist", "dashboard"],
  "engines": { "node": ">=20" },
  "os": ["win32", "darwin"],
  "scripts": { "prepublishOnly": "pnpm -w build" }
}
```

---

## 11. Phases

| Phase | Time | Deliverable |
|---|---|---|
| **0. Setup** | 2–3 din | Monorepo, TS, ESLint, CI (GitHub Actions: `windows-latest` + `macos-latest`) |
| **1. Adapters** | 1 week | `windows.ts`, `macos.ts` + real output fixtures se unit tests; `batterylens status` kaam kare |
| **2. Collector + store** | 1 week | JSONL store, analytics (usage, cycles, health), `install`/`uninstall`, bootstrap import |
| **3. Server + dashboard** | 1.5–2 weeks | API, Next static export, sab charts, 3 themes, responsive |
| **4. Export + polish** | 1 week | Print/PDF, CSV export, empty states, error states, docs, screenshots |
| **5. Release v1.0** | 2–3 din | `npm publish --provenance`, README GIF, Product Hunt / Reddit / dev.to post |
| **6. Post-v1** | ongoing | Linux, notifications, tray app — `FEATURES.md` dekho |

---

## 12. Testing checklist

- [ ] Windows 10 + 11, Intel + AMD laptops, ek desktop (no battery → friendly message)
- [ ] macOS Intel + Apple Silicon
- [ ] Laptop jo `CycleCount` 0 deta hai
- [ ] Sleep/hibernate ke beech gaps sahi count ho
- [ ] Timezone change / DST
- [ ] Port busy → next free port
- [ ] 31ve din sabse purani file delete ho, 30 files bachi rahein (fake clock se test)
- [ ] Laptop midnight pe sleep me ho → wake ke baad prune chale
- [ ] 3 din laptop band raha → wapas aane pe ek saath sahi files delete hon
- [ ] Clear: galat confirm text / missing token / dusre Origin se request → kuch delete na ho
- [ ] Clear ke baad collector naya data likhta rahe
- [ ] npx cache clear ke baad collector chalta rahe
- [ ] Non-English Windows (powercfg XML tags same rehte hain, par HTML report language badalti hai: isliye hamesha `/xml` use karo)

## 13. Privacy & security

- Server sirf `127.0.0.1`, koi external network call nahi
- Koi telemetry nahi (README me clearly likho, users trust karenge)
- Serial number PDF export me optionally mask karo (`XXXX1234`)
- Koi admin/sudo nahi maangna
