import { round3 } from './segments';

export type AbLoop = { a: number | null; b: number | null; enabled: boolean };
export type AbError = 'A_NOT_BEFORE_B';
export type AbResult = { ok: true; loop: AbLoop } | { ok: false; error: AbError };

export const emptyLoop = (): AbLoop => ({ a: null, b: null, enabled: false });

export function setA(loop: AbLoop, t: number): AbResult {
  const a = round3(t);
  if (loop.b !== null && a >= loop.b) return { ok: false, error: 'A_NOT_BEFORE_B' };
  return { ok: true, loop: { ...loop, a } };
}

export function setB(loop: AbLoop, t: number): AbResult {
  const b = round3(t);
  if (loop.a !== null && loop.a >= b) return { ok: false, error: 'A_NOT_BEFORE_B' };
  return { ok: true, loop: { ...loop, b } };
}

export const isActive = (loop: AbLoop) => loop.enabled && loop.a !== null && loop.b !== null && loop.a < loop.b;

export const shouldJump = (loop: AbLoop, t: number) => isActive(loop) && t >= (loop.b as number);

const MIN_GAP = 0.1;

/** Nudges A or B; the result always keeps A < B. */
export function nudgeLoop(loop: AbLoop, which: 'a' | 'b', delta: number): AbLoop {
  if (which === 'a') {
    if (loop.a === null) return loop;
    let a = Math.max(0, loop.a + delta);
    if (loop.b !== null) a = Math.min(a, loop.b - MIN_GAP);
    return { ...loop, a: round3(a) };
  }
  if (loop.b === null) return loop;
  let b = loop.b + delta;
  if (loop.a !== null) b = Math.max(b, loop.a + MIN_GAP);
  return { ...loop, b: round3(b) };
}

export const toggleLoop = (loop: AbLoop, enabled = !loop.enabled): AbLoop => ({ ...loop, enabled });

export const resetLoop = emptyLoop;
