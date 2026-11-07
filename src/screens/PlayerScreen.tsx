import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AbLoopPanel } from '@/components/AbLoopPanel';
import { Button } from '@/components/Button';
import { E2ELogPanel } from '@/components/E2ELogPanel';
import { MirrorBadge } from '@/components/MirrorBadge';
import { SegmentEditorHandle, SegmentList } from '@/components/SegmentList';
import { colors } from '@/components/theme';
import { Timeline } from '@/components/Timeline';
import { TransportControls } from '@/components/TransportControls';
import { VideoInfoSheet } from '@/components/VideoInfoSheet';
import type { Video } from '@/domain/schema';
import { NativeBridge } from '@/engines/native/NativeBridge';
import { NativeEngine } from '@/engines/native/NativeEngine';
import type { PlayerBridge } from '@/engines/PlayerBridge';
import { YouTubeBridge } from '@/engines/youtube/YouTubeBridge';
import { YouTubeEngine } from '@/engines/youtube/YouTubeEngine';
import { IS_E2E } from '@/platform/env';
import { deleteVideoWithConfirm, linkYouTubeUrl } from '@/services/flows';
import { useExternal } from '@/state/externalStore';
import { useLibrary } from '@/state/libraryStore';
import { usePlayer } from '@/state/playerStore';
import { mapKey } from '@/utils/keyboard';
import MirrorPlayer from '../../modules/mirror-player';

export const ERROR_TEXT: Record<string, string> = {
  EMBED_BLOCKED: '이 영상은 외부 재생이 차단되어 있습니다.',
  NOT_FOUND: '영상을 찾을 수 없습니다.',
  INVALID_PARAM: '잘못된 영상 ID입니다.',
  HTML5_ERROR: '플레이어 오류가 발생했습니다.',
  LOAD_FAILED: '영상 파일을 열 수 없습니다.',
  UNKNOWN: '재생 중 오류가 발생했습니다.',
};

const AB_ERROR = 'A 지점은 B 지점보다 앞이어야 합니다';

type Props = { videoId: string; fileUriFor?: (fileName: string) => string; onRelink?: (id: string) => void };

export function PlayerScreen(props: Props) {
  return <PlayerSession key={props.videoId} {...props} />;
}

function PlayerSession({ videoId, fileUriFor, onRelink }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  const navigation = useNavigation();
  const editor = useRef<SegmentEditorHandle>(null);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const editingFocused = useRef(false);
  const leaving = useRef(false);
  const leavePrompt = useRef(false);
  const confirmLeave = useCallback((proceed: () => void) => {
    if (leaving.current || !editor.current?.hasChanges()) { proceed(); return; }
    if (leavePrompt.current) return;
    leavePrompt.current = true;
    const finish = (save: boolean) => {
      if (save) editor.current?.save(); else editor.current?.discard();
      leaving.current = true; leavePrompt.current = false; proceed();
    };
    Alert.alert('저장하지 않은 라벨', '라벨을 저장하고 이동할까요?', [
      { text: '계속 편집', style: 'cancel', onPress: () => { leavePrompt.current = false; } },
      { text: '버리고 이동', style: 'destructive', onPress: () => finish(false) },
      { text: '저장하고 이동', onPress: () => finish(true) },
    ], { cancelable: true, onDismiss: () => { leavePrompt.current = false; } });
  }, []);
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (fullscreen) { event.preventDefault(); setFullscreen(false); return; }
    if (leaving.current || !editor.current?.hasChanges()) return;
    event.preventDefault();
    confirmLeave(() => navigation.dispatch(event.data.action));
  }), [navigation, confirmLeave, fullscreen]);
  useEffect(() => {
    return () => { const s = usePlayer.getState(); if (s.scrubbing) s.endScrub(s.t, false); };
  }, [videoId]);
  const video = useLibrary((s) => s.videos.find((v) => v.id === videoId));
  const allVideos = useLibrary((s) => s.videos);
  const player = usePlayer();
  const external = useExternal();
  const isFullscreen = fullscreen && !external.connected;
  useEffect(() => useExternal.subscribe((state) => {
    if (state.connected) setFullscreen(false);
  }), []);
  useEffect(() => {
    if (!isFullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setFullscreen(false); return true; });
    return () => sub.remove();
  }, [isFullscreen]);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [bodyWidth, setBodyWidth] = useState(width);
  const contentWidth = Math.max(0, bodyWidth - 24);
  const mainWidth = landscape ? Math.max(0, contentWidth - 12) * 2 / 3 : contentWidth;
  const [abError, setAbError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // The keyed PlayerSession owns exactly one engine. Saving playback must not replace it.
  const [bridge] = useState<PlayerBridge | null>(() => {
    if (!video) return null;
    return video.source === 'youtube' ? new YouTubeBridge(video.videoId, video.lastPosition ?? 0) : new NativeBridge();
  });

  // Open / close the player session.
  useEffect(() => {
    if (!video || !bridge) return;
    usePlayer.getState().open(video.id, { position: video.lastPosition, rate: video.lastRate });
    usePlayer.getState().setBridge(bridge);
    bridge.setMirrorConfig({ baseMirror: video.baseMirror, segments: video.segments });
    const p = usePlayer.getState();
    const offs = [
      bridge.on('ready', ({ rates, duration }) => {
        p.setRates(rates);
        if (duration) {
          usePlayer.setState({ duration });
          useLibrary.getState().saveYouTubeDuration(videoId, duration);
        }
        const v = useLibrary.getState().videos.find((x) => x.id === videoId);
        if (v) bridge.setMirrorConfig({ baseMirror: v.baseMirror, segments: v.segments });
        if (bridge.kind === 'local' && (v?.lastPosition ?? 0) > 0) bridge.seekTo(v!.lastPosition!);
        const rate = usePlayer.getState().rate;
        if (rate !== 1) bridge.setRate(rate);
      }),
      bridge.on('time', ({ t, duration }) => {
        usePlayer.getState().onTime(t, duration);
        useLibrary.getState().saveYouTubeDuration(videoId, duration);
      }),
      bridge.on('directSeek', ({ t }) => {
        usePlayer.getState().disableLoopOutside(t);
        usePlayer.setState({ t, seekTarget: null });
      }),
      bridge.on('rate', ({ rate }) => {
        usePlayer.setState({ rate });
        useLibrary.getState().savePlayback(videoId, usePlayer.getState().t, rate);
      }),
      bridge.on('state', ({ state }) => usePlayer.getState().onState(state)),
      bridge.on('mirror', (tr) => usePlayer.getState().onMirror(tr)),
      bridge.on('loop', ({ count }) => usePlayer.getState().onLoop(count)),
      bridge.on('error', ({ code }) => usePlayer.getState().setError(code)),
    ];
    return () => {
      offs.forEach((off) => off());
      usePlayer.getState().close();
      if (bridge instanceof NativeBridge) bridge.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  const playing = player.state === 'playing';
  useEffect(() => {
    if (playing) activateKeepAwakeAsync('player');
    else deactivateKeepAwake('player');
    return () => {
      deactivateKeepAwake('player');
    };
  }, [playing]);

  // Hardware keyboard shortcuts (P2).
  useEffect(() => {
    if (!bridge) return;
    MirrorPlayer.enableKeyboardShortcuts();
    const sub = MirrorPlayer.addListener('onKey', ({ key, shift }) => {
      const action = mapKey(key, shift);
      const s = usePlayer.getState();
      if (!action || editingFocused.current) return;
      if (action.type === 'togglePlay') {
        if (s.state === 'playing') bridge.pause();
        else bridge.play();
      }
      else if (action.type === 'seekBy') s.seekBy(action.delta);
      else if (action.type === 'step') {
        const video = useLibrary.getState().videos.find((v) => v.id === videoId);
        s.stepFrames(action.frames, video?.source === 'local' ? video.fps ?? 30 : 30);
      }
      else if (action.type === 'markA') setAbError(s.markA() ? AB_ERROR : null);
      else if (action.type === 'markB') setAbError(s.markB() ? AB_ERROR : null);
      else if (action.type === 'toggleBaseMirror') {
        const v = useLibrary.getState().videos.find((x) => x.id === videoId);
        if (v) s.setBaseMirror(!v.baseMirror);
      }
    });
    return () => sub.remove();
  }, [bridge, videoId]);

  if (!video || !bridge) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.text}>영상을 찾을 수 없습니다</Text>
        <Button testID="btn-back" label="← 라이브러리" onPress={() => confirmLeave(() => router.back())} />
      </SafeAreaView>
    );
  }

  const isLocal = video.source === 'local';
  const ready = player.videoId === video.id;
  const inExternal = external.connected;
  const fileUri = isLocal && video.fileName ? (fileUriFor ?? defaultFileUri)(video.fileName) : null;

  const engine = isLocal ? (
    fileUri ? (
      <NativeEngine bridge={bridge as NativeBridge} fileUri={fileUri} fps={video.fps} external={inExternal} />
    ) : (
      <View style={styles.center}>
        <Text style={styles.text}>파일 없음</Text>
        <Button testID="btn-player-relink" label="파일 연결" onPress={() => onRelink?.(video.id)} />
      </View>
    )
  ) : (
    <YouTubeEngine bridge={bridge as YouTubeBridge} external={inExternal} />
  );

  const videoArea = inExternal ? (
    <View testID="external-mode" style={styles.externalArea}>
      {isLocal ? (
        <View style={styles.preview}>{engine}</View>
      ) : (
        <>
          {engine}
          <Text testID="tv-playing" style={styles.tv}>
            TV에서 재생 중
          </Text>
          <Button testID="btn-youtube-settings" label="iPad에서 화질·자막 설정" onPress={() => {
            MirrorPlayer.openYouTubeSettings().then((opened) => {
              if (!opened) Alert.alert('설정을 열 수 없습니다', 'YouTube 플레이어가 준비된 뒤 다시 시도하세요.');
            }).catch(() => Alert.alert('설정을 열 수 없습니다', '개발용 앱을 다시 설치한 뒤 시도하세요.'));
          }} />
        </>
      )}
      <MirrorBadge mirrored={player.mirrored} large />
    </View>
  ) : (
    <View testID="video-area" style={isFullscreen ? styles.fullscreenVideo : styles.video}>
      {engine}
      {isFullscreen && (
        <View style={[styles.fullscreenButton, { top: Math.max(12, insets.top), right: Math.max(12, insets.right) }]}>
          <Button testID="btn-exit-fullscreen" label="✕" accessibilityLabel="전체화면 닫기" style={styles.fullscreenToggle}
            onPress={() => setFullscreen(false)} />
        </View>
      )}
    </View>
  );

  const errorBanner = player.error && (
    <View testID="player-error" style={styles.errorBox}>
      <Text style={styles.errorText}>{ERROR_TEXT[player.error] ?? ERROR_TEXT.UNKNOWN}</Text>
      {player.error === 'EMBED_BLOCKED' && <Text style={styles.text}>영상 파일이 있다면 라이브러리의 [파일에서 가져오기]로 연습할 수 있습니다.</Text>}
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      <Timeline duration={player.duration} t={player.t} segments={video.segments} loop={player.loop} pendingStart={pendingStart}
        onSeek={(t) => usePlayer.getState().seekTo(t)} onScrubStart={() => usePlayer.getState().beginScrub()}
        onScrubPreview={(t) => usePlayer.getState().updateScrub(t)} onScrubEnd={(t, resume) => usePlayer.getState().endScrub(t, resume)} />
      <TransportControls
        t={player.t}
        duration={player.duration}
        playing={playing}
        isLocal={isLocal}
        rate={player.rate}
        rates={player.rates}
        onFullscreen={inExternal ? undefined : () => setFullscreen(true)}
        onPlay={() => bridge.play()}
        onPause={() => bridge.pause()}
        onSeekBy={(d) => usePlayer.getState().seekBy(d)}
        onStep={isLocal ? (n) => usePlayer.getState().stepFrames(n, video.fps ?? 30) : undefined}
        onRate={(r) => player.setRate(r)}
      />
    </View>
  );

  const panel = (
    <View style={styles.panelInner}>
      <SegmentList
        key={video.id}
        ref={editor}
        pendingStart={pendingStart}
        onPendingStartChange={setPendingStart}
        onEditingFocusChange={(focused) => { editingFocused.current = focused; }}
        segments={video.segments}
        t={player.t}
        duration={player.duration}
        fps={isLocal ? (video.fps ?? 30) : undefined}
        newId={() => require('expo-crypto').randomUUID()}
        onChange={(segs) => player.applySegments(segs)}
        onSeek={(t) => usePlayer.getState().seekTo(t)}
      />
      <AbLoopPanel
        loop={player.loop}
        loopCount={player.loopCount}
        error={abError}
        onMarkA={() => setAbError(player.markA() ? AB_ERROR : null)}
        onMarkB={() => setAbError(player.markB() ? AB_ERROR : null)}
        onNudge={(w, d) => player.nudgeLoopPoint(w, d)}
        onToggle={() => player.toggleLoop()}
        onReset={() => {
          setAbError(null);
          player.resetLoop();
        }}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, isFullscreen && styles.fullscreenScreen]} edges={isFullscreen ? [] : ['top', 'right', 'bottom', 'left']} testID="screen-player">
      {isFullscreen && <StatusBar hidden />}
      <View style={[styles.header, isFullscreen && styles.hidden]}>
        <Button testID="btn-back" label="←" onPress={() => confirmLeave(() => router.back())} />
        <Text testID="player-title" numberOfLines={1} style={styles.title}>
          {video.title}
        </Text>
        <MirrorBadge mirrored={player.mirrored} />
        <Button
          testID="btn-base-mirror"
          accessibilityLabel={video.baseMirror ? 'base:on' : 'base:off'}
          label={video.baseMirror ? '전체 반전 ON' : '전체 반전 OFF'}
          variant={video.baseMirror ? 'active' : 'default'}
          onPress={() => player.setBaseMirror(!video.baseMirror)}
        />
        {IS_E2E && (
          <Button
            testID="btn-fake-external"
            accessibilityLabel={external.connected ? 'external:on' : 'external:off'}
            label="TV"
            onPress={() => external.setFake(!external.fake)}
          />
        )}
        <Button testID="btn-info" label="정보" onPress={() => setShowInfo(true)} />
      </View>
      {IS_E2E && ready && !isFullscreen && <E2ELogPanel log={player.mirrorLog} maxErrorMs={player.maxErrorMs} loopCount={player.loopCount} state={player.state} stalls={player.stallCount} />}
      <View
        testID={inExternal ? 'layout-controller' : 'layout-solo'}
        onLayout={(event) => setBodyWidth(event.nativeEvent.layout.width)}
        style={[styles.body, landscape ? styles.row : styles.column, isFullscreen && styles.fullscreenBody]}
        accessibilityLabel={landscape ? 'layout:landscape' : 'layout:portrait'}
      >
        <View testID={landscape ? 'layout-landscape' : 'layout-portrait'} style={[styles.main, { width: mainWidth }, isFullscreen && styles.fullscreenMain]}>
          {videoArea}
          <View style={isFullscreen ? styles.hidden : undefined}>{errorBanner}</View>
          <View style={isFullscreen ? styles.hidden : undefined}>{controls}</View>
        </View>
        <ScrollView testID="segment-panel" style={[styles.side, { width: landscape ? Math.max(0, contentWidth - 12) / 3 : contentWidth }, isFullscreen && styles.hidden]} scrollEnabled
          keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {panel}
        </ScrollView>
      </View>
      {showInfo && (
        <VideoInfoSheet
          video={video}
          allVideos={allVideos}
          onClose={() => setShowInfo(false)}
          onRename={(t) => useLibrary.getState().rename(video.id, t)}
          onMemo={(m) => useLibrary.getState().setMemo(video.id, m)}
          onTags={(t) => useLibrary.getState().setTags(video.id, t)}
          onDelete={async () => {
            setShowInfo(false);
            if (await deleteVideoWithConfirm(video.id)) router.back();
          }}
          onRelink={() => {
            setShowInfo(false);
            onRelink?.(video.id);
          }}
          onLinkYouTube={(url) => linkYouTubeUrl(video.id, url)}
        />
      )}
    </SafeAreaView>
  );
}

function defaultFileUri(name: string) {
  return require('@/platform/files').videoUri(name);
}

export type { Video };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hidden: { display: 'none' },
  fullscreenScreen: { backgroundColor: '#000' },
  fullscreenBody: { padding: 0, gap: 0 },
  fullscreenMain: { flex: 1, width: '100%', gap: 0 },
  fullscreenVideo: { flex: 1, width: '100%', backgroundColor: '#000' },
  fullscreenButton: { position: 'absolute', top: 8, right: 8 },
  fullscreenToggle: { minWidth: 44, minHeight: 44, backgroundColor: '#171a21cc' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  body: { flex: 1, gap: 12, padding: 12 },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  // Explicit widths keep intrinsic video/ScrollView sizes from changing the column ratio after rotation.
  main: { gap: 10, flexShrink: 0, minWidth: 0 },
  side: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 0, backgroundColor: colors.panel, borderRadius: 12, padding: 10 },
  video: { aspectRatio: 16 / 9, width: '100%', backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  externalArea: { aspectRatio: 16 / 9, width: '100%', backgroundColor: '#000', borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 16 },
  preview: { width: 320, height: 180, borderRadius: 6, overflow: 'hidden' },
  tv: { color: colors.text, fontSize: 28, fontWeight: '700' },
  controls: { gap: 10 },
  panelInner: { gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  text: { color: colors.text },
  errorBox: { backgroundColor: '#3a1f24', borderRadius: 8, padding: 10, gap: 4 },
  errorText: { color: colors.danger, fontWeight: '700' },
});
