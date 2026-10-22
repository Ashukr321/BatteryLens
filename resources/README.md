# 🔋 BatteryLens

> One command. Full battery story. Windows + macOS.

```bash
npx batterylens
```

Ek command chalao, aur `http://localhost:4545` par ek interactive dashboard khul jaata hai jisme dikhta hai:

- Battery health (current capacity vs design capacity), aaj ka aur last 30 days ka trend
- 24h / 7 days / 14 days / 30 days / monthly: kitne ghante **charger pe** aur kitne **battery pe** chala
- Charge cycles (cycle count, kitni baar 100% tak full charge hua, equivalent full cycles)
- Battery manufacturer, model, serial, manufacture/first-use date, laptop model, user name
- Light / Dark / Night Owl themes
- One-click PDF export

Sab data **sirf aapke laptop par** rehta hai. Koi cloud nahi, koi telemetry nahi.

---

## Repo / package name

| Priority | Name | Kyun |
|---|---|---|
| ✅ Recommended | `batterylens` | Short, clear, "battery ko lens se dekhna" |
| Alternative | `battpulse` | Catchy, live monitoring feel |
| Alternative | `chargelog` | Charging history pe focus |
| Alternative | `juicetrack` | Fun, memorable |

Publish karne se pehle availability check karo:

```bash
npm view batterylens   # "404 Not Found" aaye to naam free hai
```

Agar naam le liya gaya ho to scoped package use karo: `@yourname/batterylens`.

GitHub repo: `github.com/<your-username>/batterylens`

---

## Commands (planned)

| Command | Kaam |
|---|---|
| `npx batterylens` | Dashboard start (port 4545) + browser open |
| `npx batterylens install` | Background collector install (har minute data save karega) |
| `npx batterylens uninstall` | Collector hatao (data rakhna/hatana aapki choice) |
| `npx batterylens status` | Terminal me quick summary |
| `npx batterylens report --pdf` | Seedha PDF report generate |
| `npx batterylens clear` | Saara record delete (`DELETE` type karke confirm; `--yes` se skip) |
| `npx batterylens --port 5000` | Custom port |

> **Important:** 24h/30-day history ke liye `install` ek baar chalana zaroori hai. Single run sirf "abhi" ka snapshot + OS ki purani history (Windows ~3 din, macOS `pmset` log) dikha sakta hai. Details `IMPLEMENTATION_PLAN.md` me.

## Data retention

- Data hamesha **last 30 days** ka rehta hai (rolling). 31va din aate hi sabse purana din apne aap delete ho jaata hai, isliye disk par max ~5 MB.
- Cleanup background collector khud karta hai (koi alag cron setup nahi).
- Saara data hatana ho to dashboard **Settings → Clear all records** (confirmation ke saath) ya `npx batterylens clear`.

---

## Docs

- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md): architecture, OS-wise data sources, folder structure, phases
- [`FEATURES.md`](./FEATURES.md): suggested features roadmap (day-to-day use ke liye)

## Tech stack

Node.js (CLI + collector + API) · Next.js (static export dashboard) · Recharts · Tailwind CSS · next-themes · fast-xml-parser · plist

## License

MIT
