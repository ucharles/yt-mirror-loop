import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { SegmentList } from '../SegmentList';
import { Timeline } from '../Timeline';

const segments = [{ id: 'a', start: 10, end: 20, label: '뒤돌기' }, { id: 'b', start: 22, end: 30 }];

it('drag previews before release, clamps the final target and ignores old engine positions', async () => {
  const onSeek = jest.fn();
  const end = jest.fn();
  const props = { duration: 100, t: 10, segments: [], loop: { a: null, b: null, enabled: false }, onSeek, onScrubEnd: end };
  const { rerender } = await render(<Timeline {...props} pendingStart={20} />);
  await act(async () => screen.getByTestId('timeline').props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
  await fireEvent(screen.getByTestId('timeline'), 'responderGrant', { nativeEvent: { locationX: 60 } });
  await fireEvent(screen.getByTestId('timeline'), 'responderMove', { nativeEvent: { locationX: 140 } });
  expect(screen.getByTestId('timeline').props.onResponderTerminationRequest()).toBe(false);
  await rerender(<Timeline {...props} t={11} />);
  expect(screen.getByTestId('timeline').props.accessibilityValue.now).toBe(70);
  expect(onSeek).toHaveBeenCalledWith(30);
  await fireEvent(screen.getByTestId('timeline'), 'responderRelease', { nativeEvent: { locationX: 250 } });
  expect(onSeek).toHaveBeenLastCalledWith(100);
  expect(end).toHaveBeenCalledWith(100, true);
});

it('start mark toggles to cancellation and current segment uses an exclusive end', async () => {
  const mark = jest.fn();
  const props = { segments, t: 10, duration: 60, newId: () => 'n', onChange: jest.fn(), onSeek: jest.fn(), onPendingStartChange: mark };
  const { rerender } = await render(<SegmentList {...props} />);
  expect(screen.getByTestId('segment-row-0').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByTestId('btn-mark-start'));
  expect(mark).toHaveBeenLastCalledWith(10);
  expect(screen.getByTestId('btn-mark-start').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByTestId('btn-mark-start'));
  expect(mark).toHaveBeenLastCalledWith(null);
  await rerender(<SegmentList {...props} t={20} />);
  expect(screen.getByTestId('segment-row-0').props.accessibilityState.selected).toBe(false);
});

it('label drafts survive nudging and blur, save explicitly, and cancel without writing', async () => {
  const changed = jest.fn();
  await render(<SegmentList segments={segments} t={12} duration={60} newId={() => 'n'} onChange={changed} onSeek={jest.fn()} />);
  expect(screen.queryByTestId('seg-0-label')).toBeNull();
  await fireEvent.press(screen.getByTestId('seg-0-label-edit'));
  await fireEvent.changeText(screen.getByTestId('seg-0-label'), '후렴');
  await fireEvent(screen.getByTestId('seg-0-label'), 'blur');
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('seg-0-start-p1'));
  expect(changed.mock.calls[0][0][0]).toMatchObject({ start: 11, label: '뒤돌기' });
  expect(screen.getByTestId('seg-0-label').props.value).toBe('후렴');
  await fireEvent.press(screen.getByTestId('seg-0-label-save'));
  expect(changed.mock.calls[1][0][0].label).toBe('후렴');
  await fireEvent.press(screen.getByTestId('seg-0-label-edit'));
  await fireEvent.changeText(screen.getByTestId('seg-0-label'), '버릴 초안');
  await fireEvent.press(screen.getByTestId('seg-0-label-cancel'));
  expect(changed).toHaveBeenCalledTimes(2);
});

it('merge confirmation defers changes and preview, preserves start on cancel and commits once on consent', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const change = jest.fn(); const seek = jest.fn();
  const props = { segments, t: 19, duration: 60, newId: () => 'n', onChange: change, onSeek: seek };
  const { rerender } = await render(<SegmentList {...props} />);
  await fireEvent.press(screen.getByTestId('seg-0-label-edit'));
  await fireEvent.changeText(screen.getByTestId('seg-0-label'), '초안');
  await fireEvent.press(screen.getByTestId('btn-mark-start'));
  await rerender(<SegmentList {...props} t={23} />);
  await fireEvent.press(screen.getByTestId('btn-mark-end'));
  expect(change).not.toHaveBeenCalled(); expect(seek).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === '취소')!.onPress!());
  expect(screen.getByTestId('btn-mark-start').props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId('seg-0-label').props.value).toBe('초안');
  await rerender(<SegmentList {...props} t={24} />);
  await fireEvent.press(screen.getByTestId('btn-mark-end'));
  await act(async () => alert.mock.calls[1][2]!.find((b) => b.text === '버리고 진행')!.onPress!());
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0]).toContainEqual({ id: 'n', start: 19, end: 24 });
  expect(screen.getByTestId('btn-mark-start').props.accessibilityState.selected).toBe(false);
  expect(screen.queryByTestId('seg-0-label')).toBeNull();
  alert.mockRestore();
});

it('memo dialog opens existing text, cancels on back without saving and reopens unchanged', async () => {
  const changed = jest.fn();
  await render(<SegmentList segments={segments} t={12} duration={60} newId={() => 'n'} onChange={changed} onSeek={jest.fn()} />);
  await fireEvent.press(screen.getByTestId('seg-0-label-edit'));
  expect(screen.getByTestId('seg-0-memo-dialog')).toBeTruthy();
  expect(screen.getByTestId('seg-0-label').props.value).toBe('뒤돌기');
  await fireEvent.changeText(screen.getByTestId('seg-0-label'), '취소할 메모');
  await fireEvent(screen.getByTestId('seg-0-memo-modal'), 'requestClose');
  expect(screen.queryByTestId('seg-0-memo-dialog')).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('seg-0-label-edit'));
  expect(screen.getByTestId('seg-0-label').props.value).toBe('뒤돌기');
  await fireEvent.press(screen.getByTestId('seg-0-label-save'));
  expect(changed.mock.calls[0][0][0].label).toBe('뒤돌기');
  expect(screen.queryByTestId('seg-0-memo-dialog')).toBeNull();
});
