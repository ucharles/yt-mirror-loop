export type OEmbedResult = { title: string; thumbnailUrl?: string };
type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<any> }>;

export async function fetchOEmbed(videoId: string, fetchImpl: Fetch = fetch as any, timeoutMs = 5000): Promise<OEmbedResult> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetchImpl(url, { signal: controller.signal }), timeout]);
    if (!res.ok) return { title: videoId };
    const body = await res.json();
    return { title: typeof body.title === 'string' && body.title ? body.title : videoId, thumbnailUrl: body.thumbnail_url };
  } catch {
    return { title: videoId };
  } finally {
    clearTimeout(timer);
  }
}
