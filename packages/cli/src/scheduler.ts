import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, writeConfig } from './store.js';
import { collectorPid } from './collector.js';

const APP = path.join(BASE, 'app');
const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN_STARTUP = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'BatteryLens.vbs');
const MAC_LABEL = 'com.batterylens.collector';
const MAC_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${MAC_LABEL}.plist`);

/**
 * Copies the package (and its deps) into ~/.batterylens/app so the collector
 * keeps working after the npx cache is cleared. Returns the copied bin.js path.
 */
function copyApp(): string {
  fs.rmSync(APP, { recursive: true, force: true });
  // Under npx/global installs, deps are siblings in the enclosing node_modules.
  let nm = path.dirname(PKG_DIR);
  while (path.basename(nm) !== 'node_modules' && path.dirname(nm) !== nm) nm = path.dirname(nm);
  if (path.basename(nm) === 'node_modules') {
    fs.cpSync(nm, path.join(APP, 'node_modules'), { recursive: true, dereference: true });
    return path.join(APP, 'node_modules', path.relative(nm, PKG_DIR), 'dist', 'bin.js');
  }
  // Local checkout: the package has its own node_modules (pnpm symlinks are dereferenced).
  fs.cpSync(PKG_DIR, path.join(APP, 'pkg'), {
    recursive: true, dereference: true,
    filter: (src) => !src.startsWith(path.join(PKG_DIR, 'src')),
  });
  return path.join(APP, 'pkg', 'dist', 'bin.js');
}

export function install() {
  const bin = copyApp();
  const node = process.execPath;
  if (process.platform === 'win32') {
    // Startup-folder VBS: no admin needed, and window style 0 hides the console.
    const vbs = `CreateObject("WScript.Shell").Run """${node}"" ""${bin}"" collect", 0, False\r\n`;
    fs.mkdirSync(path.dirname(WIN_STARTUP), { recursive: true });
    fs.writeFileSync(WIN_STARTUP, vbs);
    if (!collectorPid()) spawn('wscript.exe', [WIN_STARTUP], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${bin}</string><string>collect</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${path.join(BASE, 'collector.err.log')}</string>
</dict></plist>`;
    fs.mkdirSync(path.dirname(MAC_PLIST), { recursive: true });
    fs.writeFileSync(MAC_PLIST, plist);
    const uid = process.getuid!();
    try { execFileSync('launchctl', ['bootout', `gui/${uid}`, MAC_PLIST], { stdio: 'ignore' }); } catch { /* not loaded yet */ }
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, MAC_PLIST]);
  } else {
    throw new Error('install is supported on Windows and macOS only.');
  }
  writeConfig({ installed: true });
}

export function uninstall() {
  if (process.platform === 'win32') {
    fs.rmSync(WIN_STARTUP, { force: true });
  } else if (process.platform === 'darwin') {
    try { execFileSync('launchctl', ['bootout', `gui/${process.getuid!()}`, MAC_PLIST], { stdio: 'ignore' }); } catch { /* not loaded */ }
    fs.rmSync(MAC_PLIST, { force: true });
  }
  const pid = collectorPid();
  if (pid) { try { process.kill(pid); } catch { /* already gone */ } }
  // Retries: Windows keeps the files locked for a moment after the collector exits.
  fs.rmSync(APP, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  writeConfig({ installed: false });
}
