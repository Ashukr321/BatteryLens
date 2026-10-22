// Copies the Next.js static export into the CLI package so it ships with npm.
import fs from 'node:fs';
const src = new URL('../../dashboard/out', import.meta.url);
const dest = new URL('../dashboard', import.meta.url);
if (!fs.existsSync(src)) { console.warn('dashboard/out missing — run `pnpm --filter dashboard build` first'); process.exit(0); }
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
