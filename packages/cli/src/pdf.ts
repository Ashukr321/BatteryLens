import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

export function findBrowser() {
  const candidates = process.platform === 'win32'
    ? [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean).flatMap((p) => [
        path.join(p!, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(p!, 'Microsoft', 'Edge', 'Application', 'msedge.exe')])
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
       path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')];
  return candidates.find((c) => fs.existsSync(c));
}

/** Prints `url` to `out` with headless Chrome/Edge. Throws if no browser or no file was written. */
export async function renderPdf(url: string, out: string) {
  const browser = findBrowser();
  if (!browser) throw new Error('Chrome or Edge not found.');
  fs.rmSync(out, { force: true });
  // A throwaway profile stops the browser from handing the job to an already-open window.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-browser-'));
  try {
    await new Promise<void>((resolve, reject) =>
      execFile(browser, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--virtual-time-budget=8000', `--print-to-pdf=${out}`, '--no-pdf-header-footer', url],
        (err) => (err ? reject(err) : resolve())));
    // Edge's launcher exits before the PDF is written, so wait for the file to appear.
    for (let i = 0; i < 120 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => setTimeout(r, 500));
  } finally {
    // Edge can hold the profile open a while after printing; a leftover temp folder must not fail the export.
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* left for the OS temp cleanup */ }
  }
  if (!fs.existsSync(out)) throw new Error(`PDF was not written to ${out}`);
}
