export type ParsedYouTubeUrl = { videoId: string; start: number | undefined };

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);

/** Parses `t`/`start` values: `90`, `90s`, `1m30s`, `1h2m3s`. */
export function parseTime(raw: string | null): number | undefined {
  if (!raw) return undefined;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let id: string | null = null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (host.endsWith('youtu.be')) {
    id = parts[0] ?? null;
  } else if (parts[0] === 'watch') {
    id = url.searchParams.get('v');
  } else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
    id = parts[1] ?? null;
  }
  if (!id || !ID_RE.test(id)) return null;
  const start = parseTime(url.searchParams.get('t')) ?? parseTime(url.searchParams.get('start'));
  return { videoId: id, start };
}

export function isYouTubeUrl(text: string | null | undefined): boolean {
  return !!text && parseYouTubeUrl(text) !== null;
}
