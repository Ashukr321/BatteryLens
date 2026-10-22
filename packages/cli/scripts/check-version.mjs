// prepublishOnly guard: fail fast (before upload) when this version is already on npm.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const { name, version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
let published = '';
try {
  // A shell command string, since npm is npm.cmd on Windows; name/version come from our own package.json.
  published = execSync(`npm view ${name}@${version} version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* 404: not published yet */ }

if (published === version) {
  console.error(`\n✖ ${name}@${version} is already on npm. Bump the version first, e.g. from the repo root:\n    npm run release        (patch: bug fixes)\n    npm run release:minor  (new features)\n`);
  process.exit(1);
}
