import { emptyLoop, isActive, nudgeLoop, resetLoop, setA, setB, shouldJump, toggleLoop } from '../abLoop';

const ab = (a: number, b: number) => ({ a, b, enabled: true });

describe('abLoop', () => {
  it('U-AB-01 A only / B only → inactive', () => {
    const a = setA(emptyLoop(), 5);
    expect(a.ok && isActive(toggleLoop(a.loop, true))).toBe(false);
    const b = setB(emptyLoop(), 5);
    expect(b.ok && isActive(toggleLoop(b.loop, true))).toBe(false);
  });
  it('U-AB-02 A >= B rejected', () => {
    expect(setB({ a: 5, b: null, enabled: false }, 5)).toEqual({ ok: false, error: 'A_NOT_BEFORE_B' });
    expect(setA({ a: null, b: 5, enabled: false }, 6)).toEqual({ ok: false, error: 'A_NOT_BEFORE_B' });
    expect(setB({ a: 5, b: null, enabled: false }, 8)).toEqual({ ok: true, loop: { a: 5, b: 8, enabled: false } });
  });
  it('U-AB-03 shouldJump', () => {
    expect(shouldJump(ab(5, 8), 7.99)).toBe(false);
    expect(shouldJump(ab(5, 8), 8)).toBe(true);
    expect(shouldJump({ ...ab(5, 8), enabled: false }, 9)).toBe(false);
  });
  it('U-AB-04 nudge keeps A < B', () => {
    expect(nudgeLoop(ab(5, 8), 'a', 0.1).a).toBe(5.1);
    expect(nudgeLoop(ab(5, 5.1), 'a', 0.1).a).toBe(5);
    expect(nudgeLoop(ab(5, 5.1), 'b', -0.1).b).toBe(5.1);
    expect(nudgeLoop(ab(5, 8), 'b', 0.1).b).toBe(8.1);
    expect(nudgeLoop(ab(0.05, 8), 'a', -0.1).a).toBe(0);
    expect(nudgeLoop(emptyLoop(), 'a', 0.1)).toEqual(emptyLoop());
    expect(nudgeLoop(emptyLoop(), 'b', 0.1)).toEqual(emptyLoop());
    expect(nudgeLoop({ a: null, b: 3, enabled: false }, 'b', 0.1).b).toBe(3.1);
    expect(nudgeLoop({ a: 3, b: null, enabled: false }, 'a', 0.1).a).toBe(3.1);
  });
  it('U-AB-05 reset', () => {
    expect(resetLoop()).toEqual({ a: null, b: null, enabled: false });
    expect(toggleLoop(ab(1, 2)).enabled).toBe(false);
  });
});
