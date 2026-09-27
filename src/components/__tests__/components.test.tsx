import { fireEvent, render, screen } from '@testing-library/react-native';

import { localVideo, ytVideo } from '../../../test/fixtures';
import { AbLoopPanel } from '../AbLoopPanel';
import { ImportConflictSheet } from '../ImportConflictSheet';
import { MirrorBadge } from '../MirrorBadge';
import { SegmentList } from '../SegmentList';
import { pct, Timeline } from '../Timeline';
import { TransportControls } from '../TransportControls';
import { VideoCard } from '../VideoCard';
import { E2ELogPanel } from '../E2ELogPanel';
import { formatBytes, formatRate, formatTime } from '@/utils/format';
import { mapKey } from '@/utils/keyboard';

const flat = (style: any) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Timeline', () => {
  it('C-TL-01 segment and A-B bands at % positions; tap seeks', async () => {
    const onSeek = jest.fn();
    await render(<Timeline duration={100} t={50} segments={[{ id: 'a', start: 30, end: 40 }]} loop={{ a: 10, b: 20, enabled: true }} onSeek={onSeek} />);
    expect(flat(screen.getByTestId('timeline-seg-0').props.style)).toMatchObject({ left: '30%', width: '10%' });
    expect(flat(screen.getByTestId('timeline-ab').props.style)).toMatchObject({ left: '10%', width: '10%' });
    expect(flat(screen.getByTestId('timeline-playhead').props.style)).toMatchObject({ left: '50%' });
    await fireEvent(screen.getByTestId('timeline'), 'layout', { nativeEvent: { layout: { width: 200 } } });
    await fireEvent.press(screen.getByTestId('timeline'), { nativeEvent: { locationX: 50 } });
    expect(onSeek).toHaveBeenCalledWith(25);
    expect(pct(5, 0)).toBe(0);
  });
  it('no A-B band without both points', async () => {
    await render(<Timeline duration={100} t={0} segments={[]} loop={{ a: 10, b: null, enabled: false }} onSeek={jest.fn()} />);
    expect(screen.queryByTestId('timeline-ab')).toBeNull();
  });
});

describe('SegmentList', () => {
  const setup = async (over: Partial<React.ComponentProps<typeof SegmentList>> = {}) => {
    const onChange = jest.fn();
    const onSeek = jest.fn();
    let n = 0;
    const props = { segments: [], t: 10, duration: 60, newId: () => `n${++n}`, onChange, onSeek, ...over };
    const utils = await render(<SegmentList {...props} />);
    return { ...utils, onChange, onSeek, props };
  };
  it('C-SEG-01 mark start → mark end creates a segment', async () => {
    const { onChange, rerender, props } = await setup();
    await fireEvent.press(screen.getByTestId('btn-mark-start'));
    await rerender(<SegmentList {...props} t={15} />);
    await fireEvent.press(screen.getByTestId('btn-mark-end'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'n1', start: 10, end: 15 }]);
  });
  it('C-SEG-01 nudge / label / tap seeks / delete', async () => {
    const segs = [{ id: 'a', start: 10, end: 20 }];
    const { onChange, onSeek } = await setup({ segments: segs, fps: 30 });
    await fireEvent.press(screen.getByTestId('seg-0-start-p0.1'));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', start: 10.1, end: 20 }]);
    expect(onSeek).toHaveBeenLastCalledWith(10.1);
    await fireEvent.press(screen.getByTestId('seg-0-end-m1'));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', start: 10, end: 19 }]);
    await fireEvent.press(screen.getByTestId('seg-0-start-pf'));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', start: 10.033, end: 20 }]);
    await fireEvent(screen.getByTestId('seg-0-label'), 'endEditing', { nativeEvent: { text: ' 뒤돌기 1 ' } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', start: 10, end: 20, label: '뒤돌기 1' }]);
    await fireEvent(screen.getByTestId('seg-0-label'), 'endEditing', { nativeEvent: { text: '' } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'a', start: 10, end: 20 }]);
    await fireEvent.press(screen.getByTestId('segment-row-0'));
    expect(onSeek).toHaveBeenLastCalledWith(10);
    await fireEvent.press(screen.getByTestId('seg-0-delete'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
  it('frame nudges only for local (fps)', async () => {
    await setup({ segments: [{ id: 'a', start: 10, end: 20 }] });
    expect(screen.queryByTestId('seg-0-start-pf')).toBeNull();
  });
  it('C-SEG-02 invalid mark shows inline error', async () => {
    const { rerender, props, onChange } = await setup();
    await fireEvent.press(screen.getByTestId('btn-mark-end'));
    expect(screen.getByTestId('segment-error')).toHaveTextContent(/먼저 시작/);
    await fireEvent.press(screen.getByTestId('btn-mark-start'));
    await rerender(<SegmentList {...props} t={8} />);
    await fireEvent.press(screen.getByTestId('btn-mark-end'));
    expect(screen.getByTestId('segment-error')).toHaveTextContent(/시작 지점보다 뒤/);
    await rerender(<SegmentList {...props} t={10.1} />);
    await fireEvent.press(screen.getByTestId('btn-mark-end'));
    expect(screen.getByTestId('segment-error')).toHaveTextContent(/0.2초/);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('AbLoopPanel', () => {
  it('C-AB-01 A/B mark, nudge, toggle, reset', async () => {
    const h = { onMarkA: jest.fn(), onMarkB: jest.fn(), onNudge: jest.fn(), onToggle: jest.fn(), onReset: jest.fn() };
    const { rerender } = await render(<AbLoopPanel loop={{ a: null, b: null, enabled: false }} loopCount={0} error={null} {...h} />);
    expect(screen.getByTestId('ab-a-value')).toHaveTextContent('--');
    await fireEvent.press(screen.getByTestId('btn-ab-a'));
    await fireEvent.press(screen.getByTestId('btn-ab-b'));
    expect(h.onMarkA).toHaveBeenCalled();
    expect(h.onMarkB).toHaveBeenCalled();
    await rerender(<AbLoopPanel loop={{ a: 1, b: 3, enabled: true }} loopCount={4} error="err" {...h} />);
    expect(screen.getByTestId('ab-a-value')).toHaveTextContent('0:01.000');
    await fireEvent.press(screen.getByTestId('ab-a-p0.1'));
    await fireEvent.press(screen.getByTestId('ab-b-m0.1'));
    expect(h.onNudge.mock.calls).toEqual([
      ['a', 0.1],
      ['b', -0.1],
    ]);
    expect(screen.getByTestId('btn-ab-toggle').props.accessibilityLabel).toBe('loop:on');
    await fireEvent.press(screen.getByTestId('btn-ab-toggle'));
    await fireEvent.press(screen.getByTestId('btn-ab-reset'));
    expect(h.onToggle).toHaveBeenCalled();
    expect(h.onReset).toHaveBeenCalled();
    expect(screen.getByTestId('ab-loop-count')).toHaveTextContent('4회');
    expect(screen.getByTestId('ab-error')).toHaveTextContent('err');
  });
});

describe('ImportConflictSheet', () => {
  it('C-IMP-01 three choices + apply to all', async () => {
    const onChoose = jest.fn();
    const conflict = { incoming: ytVideo({ title: 'New' }), existing: ytVideo({ title: 'Old' }) };
    const { rerender } = await render(<ImportConflictSheet conflict={conflict} index={0} total={3} onChoose={onChoose} />);
    expect(screen.getByTestId('conflict-title')).toHaveTextContent('가져올 항목: New');
    await fireEvent.press(screen.getByTestId('conflict-overwrite'));
    await fireEvent.press(screen.getByTestId('conflict-skip'));
    await fireEvent.press(screen.getByTestId('conflict-apply-all'));
    await fireEvent.press(screen.getByTestId('conflict-copy'));
    expect(onChoose.mock.calls).toEqual([
      ['overwrite', false],
      ['skip', false],
      ['copy', true],
    ]);
    await rerender(<ImportConflictSheet conflict={conflict} index={2} total={3} onChoose={onChoose} />);
    expect(screen.queryByTestId('conflict-apply-all')).toBeNull();
    await rerender(<ImportConflictSheet conflict={null} index={0} total={0} onChoose={onChoose} />);
    expect(screen.queryByTestId('conflict-sheet')).toBeNull();
  });
});

describe('VideoCard', () => {
  it('shows badge, title, segment count, duration and missing state', async () => {
    const onRelink = jest.fn();
    const onPress = jest.fn();
    const v = localVideo({ id: 'l', fileName: undefined, segments: [{ id: 's', start: 1, end: 2 }], tags: ['kpop'] });
    await render(<VideoCard video={v} onPress={onPress} onMenu={jest.fn()} onRelink={onRelink} thumbUri="file:///t.jpg" />);
    expect(screen.getByTestId('card-source-l')).toHaveTextContent('파일');
    expect(screen.getByTestId('card-segments-l')).toHaveTextContent('구간 1');
    expect(screen.getByTestId('card-duration-l')).toHaveTextContent('1:00');
    expect(screen.getByTestId('card-missing-l')).toHaveTextContent('파일 없음');
    await fireEvent.press(screen.getByTestId('btn-relink-l'));
    expect(onRelink).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('video-card-l'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('small components & utils', () => {
  it('MirrorBadge labels', async () => {
    const { rerender } = await render(<MirrorBadge mirrored />);
    expect(screen.getByTestId('badge-mirror').props.accessibilityLabel).toBe('mirror:on');
    await rerender(<MirrorBadge mirrored={false} large />);
    expect(screen.getByTestId('badge-mirror').props.accessibilityLabel).toBe('mirror:off');
  });
  it('TransportControls rate fine steps for local', async () => {
    const onRate = jest.fn();
    const onStep = jest.fn();
    await render(
      <TransportControls t={0.1666} duration={60} playing={false} isLocal rate={1} rates={[0.5, 1]} onPlay={jest.fn()} onPause={jest.fn()} onSeekBy={jest.fn()} onStep={onStep} onRate={onRate} />,
    );
    expect(screen.getByTestId('time-current')).toHaveTextContent('0:00.166');
    await fireEvent.press(screen.getByTestId('btn-rate-up'));
    await fireEvent.press(screen.getByTestId('btn-rate-down'));
    await fireEvent.press(screen.getByTestId('btn-rate-0.5'));
    expect(onRate.mock.calls).toEqual([[1.05], [0.95], [0.5]]);
    await fireEvent.press(screen.getByTestId('btn-frame-prev'));
    expect(onStep).toHaveBeenCalledWith(-1);
  });
  it('E2E panel', async () => {
    await render(<E2ELogPanel log={[{ mirrored: true, expectedAt: 2, actualAt: 2.01, errorMs: 10 }]} maxErrorMs={10} loopCount={3} state="playing" />);
    expect(screen.getByTestId('e2e-max-error')).toHaveTextContent('10.0');
    expect(screen.getByTestId('e2e-flip-count')).toHaveTextContent('1');
  });
  it('format helpers', async () => {
    expect(formatTime(5 / 30, true)).toBe('0:00.166');
    expect(formatTime(3723.5)).toBe('62:03');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
    expect(formatRate(0.5)).toBe('0.5×');
  });
  it('C-KB-01 key events map to actions', async () => {
    expect(mapKey(' ')).toEqual({ type: 'togglePlay' });
    expect(mapKey('Space')).toEqual({ type: 'togglePlay' });
    expect(mapKey('ArrowLeft')).toEqual({ type: 'seekBy', delta: -1 });
    expect(mapKey('ArrowRight', true)).toEqual({ type: 'seekBy', delta: 0.1 });
    expect(mapKey('ArrowLeft', true)).toEqual({ type: 'seekBy', delta: -0.1 });
    expect(mapKey('ArrowRight')).toEqual({ type: 'seekBy', delta: 1 });
    expect(mapKey(',')).toEqual({ type: 'step', frames: -1 });
    expect(mapKey('.')).toEqual({ type: 'step', frames: 1 });
    expect(mapKey('[')).toEqual({ type: 'markA' });
    expect(mapKey(']')).toEqual({ type: 'markB' });
    expect(mapKey('M')).toEqual({ type: 'toggleBaseMirror' });
    expect(mapKey('x')).toBeNull();
  });
});
