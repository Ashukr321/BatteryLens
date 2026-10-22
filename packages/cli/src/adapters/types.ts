export interface DeviceInfo {
  userName: string;
  computerName: string;
  laptopModel: string;
  laptopManufacturer: string;
  os: string;
  battery: {
    manufacturer?: string;
    model?: string;
    serial?: string;
    chemistry?: string;
    manufactureDate?: string;
    firstSeenDate: string;
    designCapacity: number;
    capacityUnit: 'mWh' | 'mAh';
    designCycleCount?: number;
  };
}

export interface Sample {
  ts: number;
  percent: number;
  acConnected: boolean;
  charging: boolean;
  fullChargeCapacity?: number;
  cycleCount?: number;
  temperatureC?: number;
  voltageMv?: number;
  adapterWatts?: number;
  /** Estimated: user idle time below the OS display-off timeout. Recorded by the collector only. */
  screenOn?: boolean;
  /** Top apps in the last minute: CPU seconds (Windows) or energy impact (macOS). Collector only. */
  apps?: Record<string, number>;
}

export type Activity = Pick<Sample, 'screenOn' | 'apps'>;

export interface Adapter {
  /** null when the machine has no battery (desktop). */
  device(): Promise<DeviceInfo | null>;
  sample(): Promise<Sample | null>;
  /** Whatever history the OS already kept, so the first dashboard isn't empty. */
  history(): Promise<Sample[]>;
  /** Screen state and per-app load since the previous call; only the collector calls this, once a minute. */
  activity?(acConnected: boolean): Promise<Activity>;
  close?(): void;
}
