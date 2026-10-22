import type { Adapter } from './types.js';
import { windowsAdapter } from './windows.js';
import { macosAdapter } from './macos.js';

export * from './types.js';

export function getAdapter(): Adapter {
  if (process.platform === 'win32') return windowsAdapter();
  if (process.platform === 'darwin') return macosAdapter();
  throw new Error(`BatteryLens supports Windows and macOS only (got ${process.platform}).`);
}
