import type { LocalVideo, YouTubeVideo } from '@/domain/schema';

const T = '2026-09-27T12:00:00.000Z';

export function ytVideo(p: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    id: 'yt-1',
    source: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'Song',
    originalTitle: 'Song',
    tags: [],
    baseMirror: false,
    segments: [],
    createdAt: T,
    updatedAt: T,
    ...p,
  };
}

export function localVideo(p: Partial<LocalVideo> = {}): LocalVideo {
  const fileSize = p.fileSize ?? 1000;
  const durationMs = p.durationMs ?? 60000;
  return {
    id: 'loc-1',
    source: 'local',
    fileName: 'loc-1.mp4',
    originalFileName: 'dance.mp4',
    title: 'dance',
    originalTitle: 'dance',
    tags: [],
    baseMirror: false,
    segments: [],
    createdAt: T,
    updatedAt: T,
    fps: 30,
    ...p,
    fileSize,
    durationMs,
    fingerprint: p.fingerprint ?? `${fileSize}:${durationMs}`,
  };
}
