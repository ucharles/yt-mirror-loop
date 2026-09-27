import { create } from 'zustand';

import { getDefaultKv, KeyValueStore, SETTINGS_KEY } from '@/storage/libraryRepo';

export type Settings = { excludeFromBackup: boolean };
const DEFAULTS: Settings = { excludeFromBackup: true };

let kv: KeyValueStore | null = null;
const store = () => (kv ??= getDefaultKv());
export function configureSettings(next: KeyValueStore) {
  kv = next;
}

function read(): Settings {
  try {
    const raw = store().getString(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

type SettingsState = Settings & {
  load(): void;
  setExcludeFromBackup(on: boolean): void;
  reset(): void;
};

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  load() {
    set(read());
  },
  setExcludeFromBackup(on) {
    set({ excludeFromBackup: on });
    store().set(SETTINGS_KEY, JSON.stringify({ excludeFromBackup: get().excludeFromBackup }));
  },
  reset() {
    store().remove(SETTINGS_KEY);
    set(DEFAULTS);
  },
}));
