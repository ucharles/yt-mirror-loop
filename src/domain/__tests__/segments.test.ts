import {
  addSegment,
  boundaries,
  frameDuration,
  inAnySegment,
  markEnd,
  markStart,
  mirrorState,
  nextBoundaryAfter,
  normalize,
  nudge,
  round3,
  validate,
} from '../segments';

const seg = (start: number, end: number, label?: string, id = `${start}-${end}`) => ({ id, start, end, label });

describe('segments', () => {
  it('U-SEG-01 start >= end', () => {
    expect(validate(seg(5, 5))).toEqual({ ok: false, error: 'START_AFTER_END' });
    expect(validate(seg(6, 5))).toEqual({ ok: false, error: 'START_AFTER_END' });
    expect(validate(seg(-1, 5))).toEqual({ ok: false, error: 'OUT_OF_RANGE' });
  });
  it('U-SEG-02 too short', () => {
    expect(validate(seg(1, 1.1))).toEqual({ ok: false, error: 'TOO_SHORT' });
    expect(validate(seg(1, 1.2)).ok).toBe(true);
  });
  it('U-SEG-03 end > duration: clamp within 0.2 s else error', () => {
    expect(validate(seg(1, 10.1), 10)).toEqual({ ok: true, segment: seg(1, 10, undefined, '1-10.1') });
    expect(validate(seg(1, 11), 10)).toEqual({ ok: false, error: 'OUT_OF_RANGE' });
    expect(validate(seg(9.9, 10.15), 10)).toEqual({ ok: false, error: 'TOO_SHORT' });
  });
  it('U-SEG-04 overlapping merged, first label kept', () => {
    expect(normalize([seg(1, 5, 'a'), seg(4, 8, 'b')])).toEqual([{ ...seg(1, 8, 'a'), id: '1-5' }]);
    expect(normalize([seg(1, 5), seg(4, 8, 'b')])[0].label).toBe('b');
  });
  it('U-SEG-05 touching merged', () => {
    expect(normalize([seg(1, 4), seg(4, 8)])).toHaveLength(1);
    expect(normalize([seg(1, 4), seg(4, 8)])[0]).toMatchObject({ start: 1, end: 8 });
  });
  it('U-SEG-06 contained', () => {
    expect(normalize([seg(1, 10), seg(2, 3)])).toEqual([seg(1, 10)]);
  });
  it('U-SEG-07 unsorted input', () => {
    expect(normalize([seg(20, 25), seg(1, 2), seg(10, 12)]).map((s) => s.start)).toEqual([1, 10, 20]);
  });
  it('U-SEG-08 rounding to 3 decimals', () => {
    expect(round3(1.23456)).toBe(1.235);
    expect(normalize([seg(1.23456, 5.0004)])[0]).toMatchObject({ start: 1.235, end: 5 });
  });
  it('U-SEG-09 start inclusive / end exclusive', () => {
    const s = [seg(1, 2), seg(5, 8)];
    expect(inAnySegment(5, s)).toBe(true);
    expect(inAnySegment(8, s)).toBe(false);
    expect(inAnySegment(0.5, s)).toBe(false);
    expect(inAnySegment(3, s)).toBe(false);
    expect(inAnySegment(1.5, s)).toBe(true);
    expect(inAnySegment(1, [])).toBe(false);
  });
  it('U-SEG-10 XOR truth table', () => {
    const s = [seg(30, 40)];
    expect(mirrorState(10, false, s)).toBe(false);
    expect(mirrorState(35, false, s)).toBe(true);
    expect(mirrorState(10, true, s)).toBe(true);
    expect(mirrorState(35, true, s)).toBe(false);
  });
  it('U-SEG-11 boundaries', () => {
    expect(boundaries([seg(5, 8), seg(1, 2), seg(2, 3)])).toEqual([1, 2, 3, 5, 8]);
  });
  it('U-SEG-12 nextBoundaryAfter', () => {
    const b = [1, 2, 5, 8];
    expect(nextBoundaryAfter(0, b)).toBe(1);
    expect(nextBoundaryAfter(2, b)).toBe(5);
    expect(nextBoundaryAfter(4.9, b)).toBe(5);
    expect(nextBoundaryAfter(8, b)).toBeUndefined();
  });
  it('U-SEG-13 nudge respects validation', () => {
    const s = seg(10, 20);
    expect(nudge(s, 'start', 0.1).start).toBe(10.1);
    expect(nudge(s, 'start', -1).start).toBe(9);
    expect(nudge(s, 'start', frameDuration(30)).start).toBe(10.033);
    expect(nudge(s, 'start', 100).start).toBe(19.8);
    expect(nudge(seg(0.05, 1), 'start', -1).start).toBe(0);
    expect(nudge(s, 'end', 1).end).toBe(21);
    expect(nudge(s, 'end', -100).end).toBe(10.2);
    expect(nudge(s, 'end', 5, 22).end).toBe(22);
  });
  it('U-SEG-14 mark flow', () => {
    const st = markStart(10);
    expect(markEnd(st, 8, 'x')).toEqual({ ok: false, error: 'START_AFTER_END' });
    expect(markEnd(st, 15, 'x')).toEqual({ ok: true, segment: { id: 'x', start: 10, end: 15 } });
    expect(markEnd({ pendingStart: null }, 15, 'x').ok).toBe(false);
    expect(addSegment([seg(1, 5)], seg(3, 9))).toHaveLength(1);
  });
});
