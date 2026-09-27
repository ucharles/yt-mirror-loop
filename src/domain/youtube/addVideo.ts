import type { Video, YouTubeVideo } from '../schema';
import type { OEmbedResult } from './oembed';

export type AddYouTubeCheck = { ok: true } | { ok: false; error: 'DUPLICATE'; existingId: string };

export function checkDuplicateYouTube(videos: readonly Video[], videoId: string): AddYouTubeCheck {
  const existing = videos.find((v) => v.source === 'youtube' && v.videoId === videoId);
  return existing ? { ok: false, error: 'DUPLICATE', existingId: existing.id } : { ok: true };
}

export function createYouTubeVideo(args: { id: string; videoId: string; sourceUrl: string; meta: OEmbedResult; now: Date; start?: number }): YouTubeVideo {
  const now = args.now.toISOString();
  return {
    id: args.id,
    source: 'youtube',
    videoId: args.videoId,
    sourceUrl: args.sourceUrl,
    title: args.meta.title,
    originalTitle: args.meta.title,
    ...(args.meta.thumbnailUrl ? { thumbnail: args.meta.thumbnailUrl } : {}),
    tags: [],
    baseMirror: false,
    segments: [],
    ...(args.start !== undefined ? { lastPosition: args.start } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
