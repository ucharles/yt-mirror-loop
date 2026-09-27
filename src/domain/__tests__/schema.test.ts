import { localVideo, ytVideo } from '../../../test/fixtures';
import { LocalVideoSchema, migrate, SchemaError, VideoSchema, YouTubeVideoSchema } from '../schema';

describe('schema', () => {
  it('U-SCH-01 valid YouTube / Local parse', () => {
    expect(YouTubeVideoSchema.parse(ytVideo())).toEqual(ytVideo());
    expect(LocalVideoSchema.parse(localVideo())).toEqual(localVideo());
    expect(VideoSchema.parse(localVideo()).source).toBe('local');
  });
  it('U-SCH-02 invalid inputs', () => {
    const { title: _t, ...noTitle } = ytVideo();
    expect(VideoSchema.safeParse(noTitle).success).toBe(false);
    expect(VideoSchema.safeParse({ ...ytVideo(), source: 'vimeo' }).success).toBe(false);
    expect(VideoSchema.safeParse(ytVideo({ videoId: 'abc' })).success).toBe(false);
  });
  it('U-SCH-03 local without fileName is valid', () => {
    const { fileName: _f, ...v } = localVideo();
    expect(LocalVideoSchema.safeParse(v).success).toBe(true);
  });
  it('U-SCH-04 fingerprint enforced', () => {
    expect(LocalVideoSchema.safeParse(localVideo({ fingerprint: '1:2' })).success).toBe(false);
  });
  it('U-SCH-05 migrate', () => {
    const raw = { videos: [ytVideo()] };
    const snapshot = JSON.stringify(raw);
    expect(migrate(raw)).toEqual({ schemaVersion: 1, videos: [ytVideo()] });
    expect(JSON.stringify(raw)).toBe(snapshot);
    expect(migrate({ schemaVersion: 1, videos: [] })).toEqual({ schemaVersion: 1, videos: [] });
    const future = { schemaVersion: 99, videos: [{ weird: true }] };
    expect(() => migrate(future)).toThrow(SchemaError);
    try {
      migrate(future);
    } catch (e) {
      expect((e as SchemaError).code).toBe('UNSUPPORTED_VERSION');
    }
    expect(future.videos).toEqual([{ weird: true }]);
    expect(() => migrate(null)).toThrow('not an object');
    expect(() => migrate({ schemaVersion: 1, videos: [{}] })).toThrow(SchemaError);
    expect(() => migrate({ schemaVersion: '1' })).toThrow('unsupported');
  });
});
