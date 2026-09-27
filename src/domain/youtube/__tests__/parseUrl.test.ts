import { isYouTubeUrl, parseTime, parseYouTubeUrl } from '../parseUrl';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl', () => {
  it('U-YT-01 watch URL', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toEqual({ videoId: ID, start: undefined });
  });
  it('U-YT-02 youtu.be with t', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=42`)).toEqual({ videoId: ID, start: 42 });
  });
  it('U-YT-03 shorts', () => {
    expect(parseYouTubeUrl(`youtube.com/shorts/${ID}`)?.videoId).toBe(ID);
  });
  it('U-YT-04 embed with start', () => {
    expect(parseYouTubeUrl(`youtube.com/embed/${ID}?start=90`)).toEqual({ videoId: ID, start: 90 });
  });
  it('U-YT-05 m.youtube.com', () => {
    expect(parseYouTubeUrl(`https://m.youtube.com/watch?v=${ID}`)?.videoId).toBe(ID);
  });
  it('U-YT-06 music.youtube.com ignores list', () => {
    expect(parseYouTubeUrl(`https://music.youtube.com/watch?v=${ID}&list=PLabc`)).toEqual({ videoId: ID, start: undefined });
  });
  it('U-YT-07 t formats', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=1m30s`)?.start).toBe(90);
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=1h2m3s`)?.start).toBe(3723);
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90s`)?.start).toBe(90);
    expect(parseTime('abc')).toBeUndefined();
    expect(parseTime('')).toBeUndefined();
  });
  it('U-YT-08 no scheme and whitespace', () => {
    expect(parseYouTubeUrl(`   www.youtube.com/watch?v=${ID}  \n`)?.videoId).toBe(ID);
  });
  it('U-YT-09 invalid inputs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeUrl(`https://vimeo.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeUrl('')).toBeNull();
    expect(parseYouTubeUrl('http://[bad')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/channel/xyz')).toBeNull();
  });
  it('U-YT-10 isYouTubeUrl', () => {
    expect(isYouTubeUrl(`https://youtu.be/${ID}`)).toBe(true);
    expect(isYouTubeUrl('hello world')).toBe(false);
    expect(isYouTubeUrl(null)).toBe(false);
  });
});
