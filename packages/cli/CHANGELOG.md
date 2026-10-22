# Changelog

## Unreleased

### Added
- Smart alerts from the background collector: unplug / plug-in thresholds, hot battery, fast sleep drain, and a Monday weekly summary (Windows toast / macOS Notification Center). Configurable in Settings.
- Battery habit score (0–100) with tips, sleep drain detector, temperature chart, calendar heatmap of battery hours.
- Click a day on the usage chart, heatmap or full-charges chart to open a day detail drawer.
- Click a chart legend item to hide/show that series.
- Live card streams over SSE (`/api/live/stream`).
- "Export PDF" downloads the PDF directly (rendered by headless Chrome/Edge); falls back to the print dialog.
- JSON export, replacement-battery search link, low-wattage charger warning (macOS).
- Hindi UI (sidebar → language).
- Anomaly detection: sudden full-charge capacity drops and days that drained 2× faster than usual (Overview card).
- Installable as an app (PWA) from Chrome/Edge; "Install app" in the sidebar.
- macOS ioreg / pmset fixtures and tests; GitHub Actions CI on Windows + macOS; ESLint clean.

### Fixed
- `report --pdf` no longer fails when Edge still holds its temporary profile folder.

## 0.1.1 — 2026-10-22

### Fixed
- Live battery % now matches the Windows taskbar / macOS menu bar (Windows used a floored, smoothed value).
- Dashboard live card refreshes every 5s and immediately when the tab regains focus (was 30s).
- Browsers no longer show a stale dashboard after an upgrade (pages are served with `no-cache`; hashed assets are cached).
- `batterylens --version` reports the real package version.

### Changed
- Collapsible sidebar layout; Theme, Export PDF and version at the bottom.
- Fully responsive cards and charts that reflow when the sidebar collapses (phone, tablet, desktop).
- Clearer charts: gradient area charts for usage, health and capacity.

## 0.1.0 — 2026-10-22

- First release: dashboard (overview, usage, health, cycles, settings), Windows + macOS adapters, background collector, 30-day retention, CSV export, PDF report, Light / Dark / Night Owl themes.
