# BatteryLens: Features Checklist

Legend: `[x]` done · `[~]` partly done / done differently · `[ ]` pending
Last updated: 2026-10-22 · npm: `batterylens@0.1.0`

---

## ✅ v1: Core

### CLI & packaging
- [x] `npx batterylens` → dashboard on port 4545 + browser auto-open
- [x] `--port` custom port; busy port → next free port (up to +19)
- [x] `status` terminal summary (%, state, health, cycles, today's plugged/battery)
- [x] `clear` with `DELETE` confirm, `--yes` to skip
- [x] `report --pdf [file]` via headless Chrome/Edge (waits for Edge's async write)
- [x] `install` / `uninstall [--purge]` background collector
- [~] Windows auto-start uses the **Startup folder** instead of Task Scheduler (no admin needed)
- [x] Published on npm (`batterylens`), README, repo links, test files excluded
- [x] npm workspaces monorepo (`packages/cli`, `packages/dashboard`)

### Data collection
- [x] Windows adapter: powercfg XML (device, history) + WMI (live %, AC, charging, voltage, capacity, cycles)
- [x] Windows: one persistent PowerShell process instead of spawning every minute
- [x] Live % matches the taskbar (rounded `RemainingCapacity / FullChargedCapacity`)
- [~] macOS adapter (ioreg, system_profiler, pmset): written, **not tested on a real Mac**
- [x] Bootstrap import of OS history on first run (Windows RecentUsage, macOS pmset log)
- [x] 60s collector loop, single instance (pid lock), sleep/wake gap detection (> 3 min)
- [x] Desktop / no battery → friendly message

### Storage
- [x] JSONL, one file per local day, in `~/.batterylens/data`
- [x] 30-day rolling retention: on collector start, on day change, on dashboard start
- [x] Reader never shows more than 30 days, even if pruning ran late
- [x] Clear all records (keeps config, resets first-seen date)
- [x] `BATTERYLENS_HOME` override (used for testing)

### Analytics
- [x] Charger vs battery vs sleep/off hours, per hour (24h) / per day (7d, 14d, 30d, month)
- [x] Full charges (hysteresis ≥ 99 after < 95), equivalent cycles, charge sessions
- [x] Health % (full charge / design), 24h + daily trend, linear forecast to 80%
- [x] Cycle life used (500 assumed on Windows, clearly labelled)

### API & security
- [x] `/api/device`, `/api/live`, `/api/usage`, `/api/health`, `/api/cycles`, `/api/samples` (+ CSV), `/api/data/stats`, `POST /api/data/clear`
- [x] Binds `127.0.0.1` only
- [x] Clear needs `DELETE` + per-session token + same Origin
- [ ] SSE `/api/live/stream` (dashboard polls `/api/live` every 5s instead)

### Dashboard (Next.js static export + shadcn + Recharts)
- [x] Collapsible sidebar (icon mode, Ctrl+B); Theme / Export PDF / version in the footer
- [x] Overview: live card, health gauge, 24h level chart with charger shading, 24h donut, device card
- [x] Usage: range tabs 24h / 7d / 14d / 30d / Monthly (month picker), totals, area chart, Brush on long ranges
- [x] Health: current, trend per month, 80% date, health area + dashed forecast, capacity vs design
- [x] Cycles: cycle count + progress, full charges per day, sortable/filterable sessions table
- [x] Settings: stored-data stats, CSV export, Clear all records dialog (Export CSV first + type DELETE)
- [x] Themes: Light / Dark / Night Owl / System
- [x] PDF export: print-optimized `/report` page (light colors forced, page breaks, serial masked)
- [x] Empty, loading and error states
- [ ] Click a chart day → detail drawer
- [ ] Legend click to hide/show a series

### Quality
- [x] Unit tests: usage, cycles, retention, powercfg import, live %
- [ ] macOS fixtures (Intel + Apple Silicon ioreg / pmset) + tests
- [ ] CI (GitHub Actions: `windows-latest` + `macos-latest`)
- [ ] ESLint pass
- [ ] Real-machine test of `install` / `uninstall` (Windows + macOS)
- [ ] Testing checklist from `IMPLEMENTATION_PLAN.md` §12 (DST, 3 days off, non-English Windows…)

---

## ⭐ v1.x: Next (high value, small effort)

Suggested order:

1. [ ] **Smart charging alerts**: "80% reached, unplug" / "20%, plug in" notifications, thresholds in Settings
2. [ ] **Battery Habit Score (0–100)**: time at 100% while plugged, deep discharges, heat, with tips
3. [ ] **Calendar heatmap**: battery hours per day, GitHub-style grid
4. [ ] **Sleep drain detector**: % lost while asleep, with a warning when it's abnormal
5. [ ] **Temperature tracking & alerts** (accurate on macOS; Windows where available)
6. [ ] **Weekly summary** notification (Monday)
7. [ ] **JSON export** (CSV is already done)
8. [ ] **Replacement forecast link**: search link for the laptop model's battery (the forecast itself is done)
9. [ ] **Charger wattage info (macOS)**: adapter W + slow-charger warning (watts already collected)
10. [ ] **Hindi + English UI** (i18n)
11. [ ] Direct PDF download (`jspdf` + `svg2pdf.js`) instead of the print dialog

---

## 🚀 v2+: Bigger features

- [ ] Tray / menu-bar app (Electron or Tauri)
- [ ] App-wise energy usage (Windows `powercfg /srumutil`, macOS `top -stats power`)
- [ ] Screen-on time
- [ ] Linux support (`/sys/class/power_supply`)
- [ ] Compare mode (this month vs last month, two laptops)
- [ ] Multi-device sync (opt-in, self-hosted)
- [ ] Shareable battery health certificate (PDF + QR hash) for selling a laptop
- [ ] Anomaly detection (sudden capacity drop, abnormal drain)
- [ ] PWA install
- [ ] Documented plugin API (`/api/*`) for Home Assistant / Raycast / widgets
