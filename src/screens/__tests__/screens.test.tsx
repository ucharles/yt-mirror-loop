import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert } from 'react-native';

import { localVideo, ytVideo } from '../../../test/fixtures';
import { MirrorPlayerMock } from '../../../test/mocks/mirrorPlayer';
import { MemoryMMKV } from '../../../test/mocks/mmkv';
import { webviewCalls } from '../../../test/mocks/webview';
import type { Video } from '@/domain/schema';
import { LibraryRepo } from '@/storage/libraryRepo';
import { configureFlows, useFlows } from '@/services/flows';
import { useExternal } from '@/state/externalStore';
import { configureLibrary, useLibrary } from '@/state/libraryStore';
import { usePlayer } from '@/state/playerStore';
import { configureSettings, useSettings } from '@/state/settingsStore';
import { LibraryScreen } from '../LibraryScreen';
import { PlayerScreen } from '../PlayerScreen';
import { SettingsScreen } from '../SettingsScreen';

const router = require('expo-router').__router;
const files = { listVideoFiles: () => [], deleteVideoFile: jest.fn(), deleteThumb: jest.fn() };
const actions = { importFiles: jest.fn(), importPhotos: jest.fn(), importJson: jest.fn(), relink: jest.fn(), thumbUri: () => undefined };

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  configureLibrary({ repo: new LibraryRepo(new MemoryMMKV()), files, now: () => new Date('2026-09-27T00:00:00Z') });
  configureSettings(new MemoryMMKV());
  useLibrary.setState({ videos: [], loaded: true });
  useExternal.setState({ connected: false, fake: false });
  useFlows.setState({ message: null, plan: null, importing: false });
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2];
  return act(async () => buttons.find((b: any) => b.text === label).onPress());
};

describe('LibraryScreen', () => {
  it('C-LIB-01 empty state; cards show thumbnail, title, segment count, badge', async () => {
    await render(<LibraryScreen actions={actions} />);
    expect(screen.getByTestId('library-empty')).toBeTruthy();
    await act(async () => useLibrary.getState().add(ytVideo({ id: 'y', title: 'Hype Boy', segments: [{ id: 's', start: 1, end: 2 }] })));
    expect(screen.getByTestId('card-title-y')).toHaveTextContent('Hype Boy');
    expect(screen.getByTestId('card-source-y')).toHaveTextContent('YouTube');
    expect(screen.getByTestId('card-segments-y')).toHaveTextContent('구간 1');
    await fireEvent.press(screen.getByTestId('video-card-y'));
    expect(router.push).toHaveBeenCalledWith('/player/y');
  });
  it('C-LIB-02 file-missing card shows [파일 연결]', async () => {
    useLibrary.setState({ videos: [localVideo({ id: 'l', fileName: undefined })] });
    await render(<LibraryScreen actions={actions} />);
    await fireEvent.press(screen.getByTestId('btn-relink-l'));
    expect(actions.relink).toHaveBeenCalledWith('l');
  });
  it('C-LIB-03 delete local → confirm mentions file deletion → removed', async () => {
    useLibrary.setState({ videos: [localVideo({ id: 'l', fileName: 'l.mp4' })] });
    await render(<LibraryScreen actions={actions} />);
    await fireEvent.press(screen.getByTestId('card-menu-l'));
    fireEvent.press(screen.getByTestId('btn-info-delete'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][1]).toContain('영상 파일도 삭제됩니다');
    await pressAlertButton('삭제');
    await waitFor(() => expect(useLibrary.getState().videos).toEqual([]));
    expect(files.deleteVideoFile).toHaveBeenCalledWith('l.mp4');
  });
  it('C-LIB-04 clipboard YouTube URL → paste suggestion chip', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce('https://youtu.be/dQw4w9WgXcQ');
    const oembed = jest.fn(async () => ({ title: 'Never' }));
    configureFlows({ oembed, uuid: () => 'new-id', now: () => new Date(0) });
    await render(<LibraryScreen actions={actions} />);
    await waitFor(() => expect(screen.getByTestId('paste-suggestion')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('paste-suggestion'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/player/new-id'));
    expect(useLibrary.getState().videos[0]).toMatchObject({ title: 'Never', videoId: 'dQw4w9WgXcQ' });
  });
  it('C-LIB-05 duplicate URL → [기존 열기 / 새로 추가]', async () => {
    configureFlows({ oembed: async () => ({ title: 'T' }), uuid: () => 'dup-2', now: () => new Date(0) });
    useLibrary.setState({ videos: [ytVideo({ id: 'existing' })] });
    await render(<LibraryScreen actions={actions} />);
    await fireEvent.changeText(screen.getByTestId('url-input'), 'https://youtu.be/dQw4w9WgXcQ');
    await fireEvent.press(screen.getByTestId('btn-add-url'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][2].map((b: any) => b.text)).toEqual(['기존 열기', '새로 추가', '취소']);
    await pressAlertButton('기존 열기');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/player/existing'));
    await fireEvent.changeText(screen.getByTestId('url-input'), 'https://youtu.be/dQw4w9WgXcQ');
    await fireEvent.press(screen.getByTestId('btn-add-url'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
    await pressAlertButton('새로 추가');
    await waitFor(() => expect(useLibrary.getState().videos).toHaveLength(2));
  });
  it('search, sort, source and tag filters; banner; header actions', async () => {
    useLibrary.setState({
      videos: [ytVideo({ id: 'a', title: 'Alpha', tags: ['kpop'] }), localVideo({ id: 'b', title: 'Beta', tags: ['ballet'] })],
    });
    useFlows.setState({ message: '완료' });
    await render(<LibraryScreen actions={actions} />);
    expect(screen.getByTestId('flow-message')).toHaveTextContent('완료');
    await fireEvent.press(screen.getByTestId('btn-dismiss-message'));
    expect(screen.queryByTestId('flow-message')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('search-input'), 'alp');
    expect(screen.queryByTestId('video-card-b')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('search-input'), '');
    await fireEvent.press(screen.getByTestId('filter-source-local'));
    expect(screen.queryByTestId('video-card-a')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-source-all'));
    await fireEvent.press(screen.getByTestId('filter-tag-kpop'));
    expect(screen.queryByTestId('video-card-b')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-tag-kpop'));
    await fireEvent.press(screen.getByTestId('sort-title'));
    await fireEvent.press(screen.getByTestId('btn-import-files'));
    await fireEvent.press(screen.getByTestId('btn-import-json'));
    await fireEvent.press(screen.getByTestId('btn-settings'));
    expect(actions.importFiles).toHaveBeenCalled();
    expect(actions.importJson).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});

async function openPlayer(video: Video = ytVideo({ id: 'y', segments: [{ id: 's', start: 30, end: 40 }] })) {
  useLibrary.setState({ videos: [video] });
  const r = await render(<PlayerScreen videoId={video.id} fileUriFor={(n) => `file:///doc/videos/${n}`} onRelink={jest.fn()} />);
  return r;
}

describe('PlayerScreen', () => {
  it('C-PLY-01 YouTubeEngine for youtube, NativeEngine for local', async () => {
    await openPlayer();
    expect(screen.getByTestId('youtube-webview')).toBeTruthy();
    expect(webviewCalls.props.source.baseUrl).toBe('https://yt-mirror-loop.local/');
    expect(webviewCalls.props.injectedJavaScriptBeforeContentLoaded).toContain('ManagedMediaSource');
    expect(webviewCalls.props.injectedJavaScriptBeforeContentLoadedForMainFrameOnly).toBe(false);
    await screen.unmount();
    await openPlayer(localVideo({ id: 'l', fileName: 'l.mp4' }));
    expect(screen.getByTestId('native-player')).toBeTruthy();
    expect(MirrorPlayerMock.load).toHaveBeenCalledWith('file:///doc/videos/l.mp4', 30);
  });
  it('C-PLY-02 frame-step buttons only for local', async () => {
    await openPlayer();
    expect(screen.queryByTestId('btn-frame-next')).toBeNull();
    await screen.unmount();
    await openPlayer(localVideo({ id: 'l' }));
    await fireEvent.press(screen.getByTestId('btn-frame-next'));
    expect(MirrorPlayerMock.stepFrames).toHaveBeenCalledWith(1);
  });
  it('C-PLY-03 fine seek calls bridge.seekBy(±0.1/±1/±5)', async () => {
    await openPlayer();
    const bridge = usePlayer.getState().bridge!;
    const spy = jest.spyOn(bridge, 'seekBy');
    for (const id of ['btn-seek-m5', 'btn-seek-m1', 'btn-seek-m0.1', 'btn-seek-p0.1', 'btn-seek-p1', 'btn-seek-p5']) await fireEvent.press(screen.getByTestId(id));
    expect(spy.mock.calls.map((c) => c[0])).toEqual([-5, -1, -0.1, 0.1, 1, 5]);
  });
  it('C-PLY-04 mirror badge reflects engine mirror events', async () => {
    await openPlayer();
    const bridge = usePlayer.getState().bridge as any;
    expect(screen.getAllByTestId('badge-mirror')[0].props.accessibilityLabel).toBe('mirror:off');
    await act(async () => bridge.handleEvent({ type: 'mirror', transition: { mirrored: true, expectedAt: 30, actualAt: 30.01, errorMs: 10 } }));
    expect(screen.getAllByTestId('badge-mirror')[0].props.accessibilityLabel).toBe('mirror:on');
    expect(screen.getByTestId('e2e-max-error')).toHaveTextContent('10.0');
  });
  it('C-PLY-05 keep-awake only while playing', async () => {
    await openPlayer();
    const bridge = usePlayer.getState().bridge as any;
    await act(async () => bridge.handleEvent({ type: 'stateChange', state: 'playing' }));
    expect(activateKeepAwakeAsync).toHaveBeenCalledWith('player');
    await act(async () => bridge.handleEvent({ type: 'stateChange', state: 'paused' }));
    expect(deactivateKeepAwake).toHaveBeenLastCalledWith('player');
    expect(screen.getByTestId('btn-play')).toBeTruthy();
  });
  it('C-PLY-06 landscape vs portrait layout', async () => {
    const dims = jest.spyOn(require('react-native/Libraries/Utilities/useWindowDimensions'), 'default');
    dims.mockReturnValue({ width: 1366, height: 1024, scale: 2, fontScale: 1 } as never);
    await openPlayer();
    expect(screen.getByTestId('layout-landscape')).toBeTruthy();
    await screen.unmount();
    dims.mockReturnValue({ width: 1024, height: 1366, scale: 2, fontScale: 1 } as never);
    await openPlayer();
    expect(screen.getByTestId('layout-portrait')).toBeTruthy();
    dims.mockRestore();
  });
  it('C-EXT-01 external mode: youtube → "TV에서 재생 중" + large badge; local → small preview', async () => {
    useExternal.setState({ connected: true, fake: true });
    await openPlayer();
    expect(screen.getByTestId('layout-controller')).toBeTruthy();
    expect(screen.getByTestId('tv-playing')).toHaveTextContent('TV에서 재생 중');
    expect(screen.queryByTestId('youtube-webview')).toBeNull();
    expect(MirrorPlayerMock.setExternalContent).toHaveBeenCalledWith('youtube', expect.stringContaining('iframe_api'), 'https://yt-mirror-loop.local/');
    await screen.unmount();
    await openPlayer(localVideo({ id: 'l' }));
    expect(screen.getByTestId('external-preview')).toBeTruthy();
    expect(MirrorPlayerMock.setExternalContent).toHaveBeenCalledWith('local', null, null);
    await act(async () => useExternal.setState({ connected: false, fake: false }));
    expect(screen.getByTestId('layout-solo')).toBeTruthy();
    expect(screen.getByTestId('native-player')).toBeTruthy();
  });
  it('segments, A-B loop, base mirror, error and info sheet wiring', async () => {
    await openPlayer();
    const bridge = usePlayer.getState().bridge as any;
    const setMirror = jest.spyOn(bridge, 'setMirrorConfig');
    await act(async () => bridge.handleEvent({ type: 'ready', rates: [0.5, 1], duration: 100 }));
    await act(async () => bridge.handleEvent({ type: 'timeupdate', t: 50, duration: 100 }));
    await fireEvent.press(screen.getByTestId('btn-mark-start'));
    await act(async () => bridge.handleEvent({ type: 'timeupdate', t: 55, duration: 100 }));
    await fireEvent.press(screen.getByTestId('btn-mark-end'));
    expect(useLibrary.getState().videos[0].segments).toHaveLength(2);
    expect(setMirror).toHaveBeenLastCalledWith({ baseMirror: false, segments: useLibrary.getState().videos[0].segments });
    await fireEvent.press(screen.getByTestId('btn-base-mirror'));
    expect(useLibrary.getState().videos[0].baseMirror).toBe(true);
    await fireEvent.press(screen.getByTestId('btn-ab-b'));
    await act(async () => bridge.handleEvent({ type: 'timeupdate', t: 60, duration: 100 }));
    await fireEvent.press(screen.getByTestId('btn-ab-a'));
    expect(screen.getByTestId('ab-error')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('btn-ab-reset'));
    await fireEvent.press(screen.getByTestId('btn-rate-0.5'));
    expect(usePlayer.getState().rate).toBe(0.5);
    await act(async () => bridge.handleEvent({ type: 'error', code: 'EMBED_BLOCKED' }));
    expect(screen.getByTestId('player-error')).toHaveTextContent(/외부 재생이 차단되어/);
    expect(screen.getByTestId('player-error')).toHaveTextContent(/파일에서 가져오기/);
    await fireEvent.press(screen.getByTestId('btn-info'));
    await fireEvent(screen.getByTestId('info-title'), 'endEditing', { nativeEvent: { text: 'New title' } });
    await fireEvent.changeText(screen.getByTestId('info-tag-input'), 'kpop');
    await fireEvent.press(screen.getByTestId('btn-add-tag'));
    expect(useLibrary.getState().videos[0]).toMatchObject({ title: 'New title', tags: ['kpop'] });
    await fireEvent.press(screen.getByTestId('btn-info-close'));
    await fireEvent.press(screen.getByTestId('btn-fake-external'));
    expect(MirrorPlayerMock.setFakeExternalDisplay).toHaveBeenCalledWith(true);
  });
  it('keyboard shortcuts drive the bridge', async () => {
    await openPlayer(localVideo({ id: 'l' }));
    expect(MirrorPlayerMock.enableKeyboardShortcuts).toHaveBeenCalled();
    await act(async () => MirrorPlayerMock.emit('onKey', { key: ' ', shift: false }));
    expect(MirrorPlayerMock.play).toHaveBeenCalled();
    await act(async () => MirrorPlayerMock.emit('onKey', { key: 'ArrowLeft', shift: true }));
    expect(MirrorPlayerMock.seekBy).toHaveBeenCalledWith(-0.1);
    await act(async () => MirrorPlayerMock.emit('onKey', { key: '.', shift: false }));
    expect(MirrorPlayerMock.stepFrames).toHaveBeenCalledWith(1);
    await act(async () => MirrorPlayerMock.emit('onKey', { key: 'm', shift: false }));
    expect(useLibrary.getState().videos[0].baseMirror).toBe(true);
    await act(async () => MirrorPlayerMock.emit('onKey', { key: '[', shift: false }));
    await act(async () => MirrorPlayerMock.emit('onKey', { key: ']', shift: false }));
    await act(async () => MirrorPlayerMock.emit('onKey', { key: 'q', shift: false }));
  });
  it('unknown video shows a message', async () => {
    await render(<PlayerScreen videoId="nope" />);
    expect(screen.getByText('영상을 찾을 수 없습니다')).toBeTruthy();
  });
});

describe('SettingsScreen', () => {
  it('C-SET-01 storage total, backup-exclude toggle, version', async () => {
    const onBackupChange = jest.fn();
    useSettings.getState().reset();
    await render(<SettingsScreen storageBytes={() => 5 * 1024 * 1024} onBackupChange={onBackupChange} version="1.2.3" />);
    expect(screen.getByTestId('storage-total')).toHaveTextContent('5.0 MB');
    expect(screen.getByTestId('app-version')).toHaveTextContent('1.2.3');
    expect(screen.getByTestId('toggle-backup').props.value).toBe(true);
    await fireEvent(screen.getByTestId('toggle-backup'), 'valueChange', false);
    expect(useSettings.getState().excludeFromBackup).toBe(false);
    expect(onBackupChange).toHaveBeenCalledWith(false);
  });
});
