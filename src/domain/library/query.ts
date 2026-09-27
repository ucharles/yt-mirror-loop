import type { Video } from '../schema';

export type SortKey = 'lastOpenedAt' | 'createdAt' | 'title';
export type LibraryFilter = { search?: string; source?: 'youtube' | 'local' | 'all'; tags?: readonly string[] };

export function matchesSearch(v: Video, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase('ko');
  if (!needle) return true;
  return [v.title, v.originalTitle, v.memo ?? '', ...v.tags].some((s) => s.toLocaleLowerCase('ko').includes(needle));
}

export function filterVideos(videos: readonly Video[], f: LibraryFilter): Video[] {
  return videos.filter(
    (v) =>
      (!f.source || f.source === 'all' || v.source === f.source) &&
      (!f.tags?.length || f.tags.every((t) => v.tags.includes(t))) &&
      matchesSearch(v, f.search ?? ''),
  );
}

export function sortVideos(videos: readonly Video[], key: SortKey): Video[] {
  const copy = [...videos];
  if (key === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  // Newest first; items never opened go last (falls back to createdAt).
  const at = (v: Video) => (key === 'lastOpenedAt' ? (v.lastOpenedAt ?? '') : v.createdAt);
  return copy.sort((a, b) => at(b).localeCompare(at(a)) || b.createdAt.localeCompare(a.createdAt));
}

export function renameVideo<V extends Video>(v: V, title: string, now: Date): V {
  const trimmed = title.trim();
  return { ...v, title: trimmed || v.originalTitle, updatedAt: now.toISOString() };
}

export function allTags(videos: readonly Video[]): string[] {
  return [...new Set(videos.flatMap((v) => v.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function tagSuggestions(videos: readonly Video[], prefix: string, exclude: readonly string[] = []): string[] {
  const p = prefix.trim().toLocaleLowerCase('ko');
  return allTags(videos).filter((t) => t.toLocaleLowerCase('ko').startsWith(p) && !exclude.includes(t));
}

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}
