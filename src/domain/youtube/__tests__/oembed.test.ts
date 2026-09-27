import { fetchOEmbed } from '../oembed';

const ID = 'dQw4w9WgXcQ';

describe('fetchOEmbed', () => {
  it('U-OE-01 200 → title and thumbnail', async () => {
    const f = jest.fn(async () => ({ ok: true, json: async () => ({ title: 'Song', thumbnail_url: 'https://i.ytimg.com/x.jpg' }) }));
    await expect(fetchOEmbed(ID, f)).resolves.toEqual({ title: 'Song', thumbnailUrl: 'https://i.ytimg.com/x.jpg' });
    expect((f.mock.calls[0] as any)[0]).toContain('oembed?url=');
  });
  it('U-OE-02 401/404 → fallback', async () => {
    await expect(fetchOEmbed(ID, async () => ({ ok: false, json: async () => ({}) }))).resolves.toEqual({ title: ID });
  });
  it('U-OE-02 network error → fallback', async () => {
    await expect(fetchOEmbed(ID, async () => { throw new Error('net'); })).resolves.toEqual({ title: ID });
  });
  it('U-OE-02 missing title → fallback title', async () => {
    await expect(fetchOEmbed(ID, async () => ({ ok: true, json: async () => ({}) }))).resolves.toEqual({ title: ID, thumbnailUrl: undefined });
  });
  it('U-OE-02 timeout after 5 s → fallback', async () => {
    jest.useFakeTimers();
    const p = fetchOEmbed(ID, () => new Promise(() => {}));
    jest.advanceTimersByTime(5000);
    await expect(p).resolves.toEqual({ title: ID });
    jest.useRealTimers();
  });
});
