import { emptyLibrary, Library, LibrarySchema, migrate } from '@/domain/schema';

export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
}

export const LIBRARY_KEY = 'library.v1';
export const SETTINGS_KEY = 'settings';

export type LoadResult = { library: Library; error?: string };

export class LibraryRepo {
  constructor(
    private kv: KeyValueStore,
    private now: () => Date = () => new Date(),
  ) {}

  load(): LoadResult {
    const raw = this.kv.getString(LIBRARY_KEY);
    if (raw === undefined) return { library: emptyLibrary() };
    try {
      return { library: migrate(JSON.parse(raw)) };
    } catch (e) {
      // Keep the unreadable data for recovery instead of overwriting it silently.
      this.kv.set(`${LIBRARY_KEY}.corrupt.${this.now().toISOString()}`, raw);
      return { library: emptyLibrary(), error: (e as Error).message };
    }
  }

  save(library: Library): void {
    const parsed = LibrarySchema.parse(library);
    this.kv.set(LIBRARY_KEY, JSON.stringify(parsed));
  }

  clear(): void {
    this.kv.remove(LIBRARY_KEY);
  }
}

let defaultKv: KeyValueStore | undefined;
export function getDefaultKv(): KeyValueStore {
  if (!defaultKv) {
    const { createMMKV } = require('react-native-mmkv');
    defaultKv = createMMKV({ id: 'yt-mirror-loop' }) as KeyValueStore;
  }
  return defaultKv;
}
