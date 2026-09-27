export class MemoryMMKV {
  private store = new Map<string, string | number | boolean>();
  set(key: string, value: string | number | boolean) {
    this.store.set(key, value);
  }
  getString(key: string) {
    const v = this.store.get(key);
    return typeof v === 'string' ? v : undefined;
  }
  getBoolean(key: string) {
    const v = this.store.get(key);
    return typeof v === 'boolean' ? v : undefined;
  }
  getNumber(key: string) {
    const v = this.store.get(key);
    return typeof v === 'number' ? v : undefined;
  }
  contains(key: string) {
    return this.store.has(key);
  }
  remove(key: string) {
    return this.store.delete(key);
  }
  getAllKeys() {
    return [...this.store.keys()];
  }
  clearAll() {
    this.store.clear();
  }
}
export const createMMKV = () => new MemoryMMKV();
