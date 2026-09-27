import { create } from 'zustand';

import { extensionOf, IMPORT_ERROR_MESSAGES, ImportPorts, importLocalFiles, PickedFile } from '@/domain/import/localImport';
import type { LocalVideo, Video } from '@/domain/schema';
import { applyImport, applyToAll, Conflict, ImportPlan, planImport, Resolution } from '@/domain/transfer/conflicts';
import { buildExport, exportFileName } from '@/domain/transfer/exportJson';
import { parseImport } from '@/domain/transfer/importJson';
import { relink } from '@/domain/transfer/relink';
import { checkDuplicateYouTube, createYouTubeVideo } from '@/domain/youtube/addVideo';
import { fetchOEmbed } from '@/domain/youtube/oembed';
import { parseYouTubeUrl } from '@/domain/youtube/parseUrl';
import { useLibrary } from '@/state/libraryStore';
import { useSettings } from '@/state/settingsStore';

type FlowDeps = {
  ports: () => ImportPorts;
  share: (fileName: string, content: string) => Promise<void>;
  confirm: (title: string, message: string, ok?: string, destructive?: boolean) => Promise<boolean>;
  choose: <T extends string>(title: string, message: string, options: { label: string; value: T }[]) => Promise<T | null>;
  oembed: typeof fetchOEmbed;
  uuid: () => string;
  now: () => Date;
};

let deps: FlowDeps | null = null;
const d = (): FlowDeps =>
  (deps ??= {
    ports: () => require('@/platform/files').makeImportPorts(),
    share: (f, c) => require('@/platform/sharing').shareJson(f, c),
    confirm: (...a) => require('@/platform/dialogs').confirm(...a),
    choose: (...a) => require('@/platform/dialogs').choose(...a),
    oembed: fetchOEmbed,
    uuid: () => require('expo-crypto').randomUUID(),
    now: () => new Date(),
  });

export function configureFlows(next: Partial<FlowDeps>) {
  deps = { ...d(), ...next };
}

/* ---------- UI status shared by the library screen (banner, progress, conflict sheet) ---------- */

type FlowState = {
  importing: boolean;
  progress: number;
  importFile: string | null;
  message: string | null;
  plan: ImportPlan | null;
  conflictIndex: number;
  resolutions: Record<string, Resolution>;
  controller: AbortController | null;
};

export const useFlows = create<FlowState>(() => ({
  importing: false,
  progress: 0,
  importFile: null,
  message: null,
  plan: null,
  conflictIndex: 0,
  resolutions: {},
  controller: null,
}));

export const setMessage = (message: string | null) => useFlows.setState({ message });

/* ---------- Local file import (PRD §3.2) ---------- */

export async function runLocalImport(files: PickedFile[]): Promise<LocalVideo[]> {
  if (!files.length) return [];
  const controller = new AbortController();
  useFlows.setState({ importing: true, progress: 0, importFile: files[0].name, message: null, controller });
  try {
    const results = await importLocalFiles(files, d().ports(), {
      excludeFromBackup: useSettings.getState().excludeFromBackup,
      signal: controller.signal,
      onProgress: (progress) => useFlows.setState({ progress }),
      onFileProgress: (i) => useFlows.setState({ importFile: files[i].name }),
    });
    const ok = results.flatMap((r) => (r.ok ? [r.video] : []));
    if (ok.length) useLibrary.getState().addMany(ok);
    const failures = results.flatMap((r) => (r.ok ? [] : [`${r.fileName}: ${IMPORT_ERROR_MESSAGES[r.error]}`]));
    setMessage(failures.length ? failures.join('\n') : `${ok.length}개 영상을 가져왔습니다`);
    return ok;
  } finally {
    useFlows.setState({ importing: false, controller: null });
  }
}

export function cancelImport() {
  useFlows.getState().controller?.abort();
}

/* ---------- JSON export / import (PRD §3.11) ---------- */

export async function exportLibrary(ids?: string[]) {
  const now = d().now();
  const file = buildExport(useLibrary.getState().videos, now, ids);
  await d().share(exportFileName(now), JSON.stringify(file, null, 2));
}

function finishImport() {
  const { plan, resolutions } = useFlows.getState();
  if (!plan) return;
  const before = useLibrary.getState().videos;
  const next = applyImport(before, plan, resolutions, { uuid: d().uuid, now: d().now });
  useLibrary.getState().replaceAll(next);
  useFlows.setState({ plan: null, conflictIndex: 0, resolutions: {} });
  const added = next.length - before.length;
  const overwritten = Object.values(resolutions).filter((r) => r === 'overwrite').length;
  setMessage(`가져오기 완료: ${added}개 추가, ${overwritten}개 덮어씀`);
}

export function startJsonImport(text: string): boolean {
  const parsed = parseImport(text);
  if (!parsed.ok) {
    setMessage(parsed.message);
    return false;
  }
  const plan = planImport(useLibrary.getState().videos, parsed.file.videos);
  useFlows.setState({ plan, conflictIndex: 0, resolutions: {}, message: null });
  if (plan.conflicts.length === 0) finishImport();
  return true;
}

export function currentConflict(s: FlowState = useFlows.getState()): Conflict | null {
  return s.plan?.conflicts[s.conflictIndex] ?? null;
}

export function resolveConflict(choice: Resolution, all: boolean) {
  const s = useFlows.getState();
  const c = currentConflict(s);
  if (!s.plan || !c) return;
  const resolutions = all ? applyToAll(s.plan.conflicts, choice, s.resolutions, s.conflictIndex) : { ...s.resolutions, [c.incoming.id]: choice };
  const conflictIndex = all ? s.plan.conflicts.length : s.conflictIndex + 1;
  useFlows.setState({ resolutions, conflictIndex });
  if (conflictIndex >= s.plan.conflicts.length) finishImport();
}

/* ---------- Relink a "file missing" local video ---------- */

export async function relinkVideo(videoId: string, file: PickedFile): Promise<boolean> {
  const video = useLibrary.getState().videos.find((v) => v.id === videoId);
  if (!video || video.source !== 'local') return false;
  const ports = d().ports();
  const destName = `${ports.uuid()}.${extensionOf(file.name)}`;
  useFlows.setState({ importing: true, progress: 0, importFile: file.name, message: null });
  try {
    await ports.copy(file.uri, destName, (progress) => useFlows.setState({ progress }));
    const probe = await ports.probe(destName);
    if (!probe.playable) {
      await ports.deleteFile(destName);
      setMessage(IMPORT_ERROR_MESSAGES.UNSUPPORTED_FORMAT);
      return false;
    }
    const info = { fileName: destName, durationMs: probe.durationMs, fileSize: probe.fileSize, fps: probe.fps, width: probe.width, height: probe.height };
    let r = relink(video, info, { now: d().now() });
    if (r.status === 'NEEDS_CONFIRM') {
      useFlows.setState({ importing: false });
      const ok = await d().confirm('길이가 다른 파일입니다', `저장된 영상과 길이가 ${(r.diffMs / 1000).toFixed(1)}초 다릅니다. 그래도 연결할까요?`, '연결');
      if (!ok) {
        await ports.deleteFile(destName);
        setMessage('파일 연결을 취소했습니다');
        return false;
      }
      r = relink(video, info, { confirmed: true, now: d().now() });
    }
    if (r.status !== 'LINKED') return false;
    await ports.setExcludedFromBackup(destName, useSettings.getState().excludeFromBackup);
    const thumb = video.thumbnail ? undefined : await ports.makeThumbnail(destName, Math.round(probe.durationMs * 0.1));
    useLibrary.getState().update(videoId, { ...r.video, ...(thumb ? { thumbnail: thumb } : {}) });
    setMessage('파일을 연결했습니다');
    return true;
  } catch {
    await ports.deleteFile(destName).catch(() => {});
    setMessage('파일을 연결하지 못했습니다');
    return false;
  } finally {
    useFlows.setState({ importing: false });
  }
}

/* ---------- YouTube add (PRD §3.1) ---------- */

/** Returns the id of the video to open, or null. */
export async function addYouTube(url: string): Promise<string | null> {
  const parsed = parseYouTubeUrl(url);
  if (!parsed) {
    setMessage('YouTube 링크를 인식하지 못했습니다');
    return null;
  }
  const dup = checkDuplicateYouTube(useLibrary.getState().videos, parsed.videoId);
  if (!dup.ok) {
    const choice = await d().choose('이미 등록된 영상입니다', '기존 항목을 열까요, 새로 추가할까요?', [
      { label: '기존 열기', value: 'open' },
      { label: '새로 추가', value: 'new' },
    ]);
    if (choice === 'open') return dup.existingId;
    if (choice !== 'new') return null;
  }
  const meta = await d().oembed(parsed.videoId);
  const video: Video = createYouTubeVideo({ id: d().uuid(), videoId: parsed.videoId, sourceUrl: url, meta, now: d().now(), start: parsed.start });
  useLibrary.getState().add(video);
  return video.id;
}

/** Links a local video to its original YouTube URL (title/thumbnail via oEmbed, matching on import). */
export async function linkYouTubeUrl(videoId: string, url: string): Promise<boolean> {
  const parsed = parseYouTubeUrl(url);
  if (!parsed) {
    setMessage('YouTube 링크를 인식하지 못했습니다');
    return false;
  }
  const meta = await d().oembed(parsed.videoId);
  const v = useLibrary.getState().videos.find((x) => x.id === videoId);
  if (!v || v.source !== 'local') return false;
  const patch: Partial<LocalVideo> = { linkedVideoId: parsed.videoId };
  if (meta.title !== parsed.videoId) {
    patch.originalTitle = meta.title;
    if (v.title === v.originalTitle) patch.title = meta.title;
  }
  useLibrary.getState().update(videoId, patch);
  return true;
}

export async function deleteVideoWithConfirm(videoId: string): Promise<boolean> {
  const v = useLibrary.getState().videos.find((x) => x.id === videoId);
  if (!v) return false;
  const msg = v.source === 'local' ? `"${v.title}"을(를) 삭제합니다. 기기에 저장된 영상 파일도 삭제됩니다.` : `"${v.title}"을(를) 삭제합니다.`;
  const ok = await d().confirm('영상 삭제', msg, '삭제', true);
  if (ok) useLibrary.getState().remove(videoId);
  return ok;
}
