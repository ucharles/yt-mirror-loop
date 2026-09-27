import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const MirrorSegmentSchema = z.object({
  id: z.string().min(1),
  start: z.number().min(0),
  end: z.number().min(0),
  label: z.string().optional(),
});

const VideoBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  originalTitle: z.string(),
  thumbnail: z.string().optional(),
  memo: z.string().optional(),
  tags: z.array(z.string()),
  baseMirror: z.boolean(),
  segments: z.array(MirrorSegmentSchema),
  lastPosition: z.number().optional(),
  lastRate: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string().optional(),
});

export const YouTubeVideoSchema = VideoBaseSchema.extend({
  source: z.literal('youtube'),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'videoId must be 11 characters'),
  sourceUrl: z.string(),
});

export const LocalVideoSchema = VideoBaseSchema.extend({
  source: z.literal('local'),
  /** File name inside Documents/videos/. Never a path. */
  fileName: z
    .string()
    .regex(/^[^/\\]+$/, 'fileName must not contain a path')
    .optional(),
  originalFileName: z.string(),
  durationMs: z.number().int().nonnegative(),
  fileSize: z.number().int().nonnegative(),
  fingerprint: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  linkedVideoId: z.string().optional(),
}).refine((v) => v.fingerprint === makeFingerprint(v.fileSize, v.durationMs), {
  message: 'fingerprint must equal `${fileSize}:${durationMs}`',
  path: ['fingerprint'],
});

export const VideoSchema = z.discriminatedUnion('source', [YouTubeVideoSchema, LocalVideoSchema]);

export const LibrarySchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  videos: z.array(VideoSchema),
});

export const ExportFileSchema = z.object({
  format: z.literal('yt-mirror-loop'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  exportedAt: z.string(),
  videos: z.array(VideoSchema),
});

export type MirrorSegment = z.infer<typeof MirrorSegmentSchema>;
export type YouTubeVideo = z.infer<typeof YouTubeVideoSchema>;
export type LocalVideo = z.infer<typeof LocalVideoSchema>;
export type Video = z.infer<typeof VideoSchema>;
export type Library = z.infer<typeof LibrarySchema>;
export type ExportFile = z.infer<typeof ExportFileSchema>;

export function makeFingerprint(fileSize: number, durationMs: number) {
  return `${fileSize}:${durationMs}`;
}

export const emptyLibrary = (): Library => ({ schemaVersion: CURRENT_SCHEMA_VERSION, videos: [] });

export class SchemaError extends Error {
  constructor(
    public code: 'UNSUPPORTED_VERSION' | 'INVALID',
    message: string,
  ) {
    super(message);
  }
}

/** Brings raw stored data to the current schema version. Never mutates the input. */
export function migrate(raw: unknown): Library {
  if (!raw || typeof raw !== 'object') throw new SchemaError('INVALID', 'library is not an object');
  const obj = raw as { schemaVersion?: unknown; videos?: unknown };
  const version = obj.schemaVersion ?? 0;
  if (typeof version !== 'number' || version > CURRENT_SCHEMA_VERSION) {
    throw new SchemaError('UNSUPPORTED_VERSION', `unsupported schemaVersion ${String(version)}`);
  }
  // v0 (pre-release, no version field) had the same video shape.
  const candidate = { schemaVersion: CURRENT_SCHEMA_VERSION, videos: obj.videos ?? [] };
  const parsed = LibrarySchema.safeParse(candidate);
  if (!parsed.success) throw new SchemaError('INVALID', parsed.error.issues[0]?.message ?? 'invalid library');
  return parsed.data;
}
