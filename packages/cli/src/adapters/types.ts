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
}

export interface Adapter {
  /** null when the machine has no battery (desktop). */
  device(): Promise<DeviceInfo | null>;
  sample(): Promise<Sample | null>;
  /** Whatever history the OS already kept, so the first dashboard isn't empty. */
  history(): Promise<Sample[]>;
  close?(): void;
}
