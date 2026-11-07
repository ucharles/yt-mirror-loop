import { create } from 'zustand';

import { reconcile } from '@/domain/files/reconcile';
import { normalizeTags, renameVideo } from '@/domain/library/query';
import type { LocalVideo, Video } from '@/domain/schema';
import { MirrorSegment, normalize } from '@/domain/segments';
import { getDefaultKv, LibraryRepo } from '@/storage/libraryRepo';

export interface LibraryFiles {
  listVideoFiles(): string[];
  deleteVideoFile(name: string): void;
  deleteThumb(name: string): void;
}

type Deps = { repo: LibraryRepo; files: LibraryFiles; now: () => Date };

let deps: Deps | null = null;

function defaultDeps(): Deps {
  const files = require('@/platform/files') as LibraryFiles;
  return { repo: new LibraryRepo(getDefaultKv()), files, now: () => new Date() };
}

const d = () => (deps ??= defaultDeps());

/** Test hook / app wiring: replace persistence and file access. */
export function configureLibrary(next: Partial<Deps>) {
  deps = next.repo && next.files && next.now ? (next as Deps) : { ...d(), ...next };
}

export type LibraryState = {
  videos: Video[];
  loaded: boolean;
  loadError?: string;
  init(): void;
  add(video: Video): void;
  addMany(videos: Video[]): void;
  replaceAll(videos: Video[]): void;
  update(id: string, patch: Partial<Video>): void;
  remove(id: string): void;
  setSegments(id: string, segments: MirrorSegment[]): MirrorSegment[];
  setBaseMirror(id: string, on: boolean): void;
  rename(id: string, title: string): void;
  setMemo(id: string, memo: string): void;
  setTags(id: string, tags: string[]): void;
  markOpened(id: string): void;
  saveYouTubeDuration(id: string, seconds: number): void;
  savePlayback(id: string, position: number, rate: number): void;
  reset(): void;
};

export const useLibrary = create<LibraryState>((set, get) => {
  /** Every mutation persists immediately (PRD §3.10) — there is no save button. */
  const commit = (videos: Video[]) => {
    set({ videos });
    d().repo.save({ schemaVersion: 1, videos });
  };
  const stamp = () => d().now().toISOString();
  const patchOne = (id: string, fn: (v: Video) => Video) => commit(get().videos.map((v) => (v.id === id ? fn(v) : v)));

  return {
    videos: [],
    loaded: false,
    init() {
      const { library, error } = d().repo.load();
      let videos = library.videos;
      try {
        const r = reconcile(videos, d().files.listVideoFiles());
        r.orphans.forEach((f) => d().files.deleteVideoFile(f));
        videos = r.videos;
        if (r.changed) d().repo.save({ schemaVersion: 1, videos });
      } catch {
        // file listing unavailable; keep stored state
      }
      set({ videos, loaded: true, loadError: error });
    },
    add(video) {
      commit([video, ...get().videos]);
    },
    addMany(videos) {
      commit([...videos, ...get().videos]);
    },
    replaceAll(videos) {
      commit(videos);
    },
    update(id, patch) {
      patchOne(id, (v) => ({ ...v, ...patch, updatedAt: stamp() }) as Video);
    },
    remove(id) {
      const v = get().videos.find((x) => x.id === id);
      if (v?.source === 'local') {
        if (v.fileName) d().files.deleteVideoFile(v.fileName);
        if (v.thumbnail && !/^https?:/.test(v.thumbnail)) d().files.deleteThumb(v.thumbnail);
      }
      commit(get().videos.filter((x) => x.id !== id));
    },
    setSegments(id, segments) {
      const normalized = normalize(segments);
      patchOne(id, (v) => ({ ...v, segments: normalized, updatedAt: stamp() }));
      return normalized;
    },
    setBaseMirror(id, on) {
      patchOne(id, (v) => ({ ...v, baseMirror: on, updatedAt: stamp() }));
    },
    rename(id, title) {
      patchOne(id, (v) => renameVideo(v, title, d().now()));
    },
    setMemo(id, memo) {
      patchOne(id, (v) => {
        const next = { ...v, updatedAt: stamp() };
        if (memo.trim()) next.memo = memo;
        else delete next.memo;
        return next;
      });
    },
    setTags(id, tags) {
      patchOne(id, (v) => ({ ...v, tags: normalizeTags(tags), updatedAt: stamp() }));
    },
    markOpened(id) {
      patchOne(id, (v) => ({ ...v, lastOpenedAt: stamp() }));
    },
    saveYouTubeDuration(id, seconds) {
      const durationMs = Math.round(seconds * 1000);
      if (!Number.isSafeInteger(durationMs) || durationMs <= 0) return;
      const video = get().videos.find((v) => v.id === id);
      if (video?.source !== 'youtube' || video.durationMs === durationMs) return;
      // Metadata updates should not change the user's edit timestamp or rewrite storage every tick.
      patchOne(id, (v) => ({ ...v, durationMs }));
    },
    savePlayback(id, position, rate) {
      patchOne(id, (v) => ({ ...v, lastPosition: Math.round(position * 1000) / 1000, lastRate: rate }));
    },
    reset() {
      d().repo.clear();
      set({ videos: [], loaded: true, loadError: undefined });
    },
  };
});

export const selectVideo = (id: string | undefined) => (s: LibraryState) => s.videos.find((v) => v.id === id);
export const isLocal = (v: Video | undefined): v is LocalVideo => v?.source === 'local';
