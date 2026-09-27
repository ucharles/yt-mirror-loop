/** `m:ss` or `m:ss.mmm` (milliseconds floored so 5/30 s shows `0:00.166`). */
export function formatTime(sec: number, withMs = false): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalMs = Math.floor(safe * 1000 + 1e-6);
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60000);
  const base = `${m}:${String(s).padStart(2, '0')}`;
  return withMs ? `${base}.${String(ms).padStart(3, '0')}` : base;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export const formatRate = (r: number) => `${Number(r.toFixed(2))}×`;
