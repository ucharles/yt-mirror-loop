import { localVideo, ytVideo } from '../../../../test/fixtures';
import { allTags, filterVideos, normalizeTags, renameVideo, sortVideos, tagSuggestions } from '../query';

const vids = [
  ytVideo({ id: 'a', title: '뉴진스 Hype Boy', memo: '후렴', tags: ['kpop', '연습'], createdAt: '2026-01-01', lastOpenedAt: '2026-03-01' }),
  localVideo({ id: 'b', title: 'Apple', tags: ['kpop'], createdAt: '2026-02-01' }),
  ytVideo({ id: 'c', title: '가나다', tags: ['ballet'], createdAt: '2026-03-01', lastOpenedAt: '2026-04-01' }),
];

describe('library query', () => {
  it('U-LIB-01 search title / memo / tag, case-insensitive, Korean', () => {
    expect(filterVideos(vids, { search: 'hype' }).map((v) => v.id)).toEqual(['a']);
    expect(filterVideos(vids, { search: '후렴' }).map((v) => v.id)).toEqual(['a']);
    expect(filterVideos(vids, { search: 'BALLET' }).map((v) => v.id)).toEqual(['c']);
    expect(filterVideos(vids, { search: '  ' })).toHaveLength(3);
  });
  it('U-LIB-02 sort', () => {
    expect(sortVideos(vids, 'lastOpenedAt').map((v) => v.id)).toEqual(['c', 'a', 'b']);
    expect(sortVideos(vids, 'createdAt').map((v) => v.id)).toEqual(['c', 'b', 'a']);
    expect(sortVideos(vids, 'title').map((v) => v.id)).toEqual(['c', 'a', 'b']);
  });
  it('U-LIB-03 source and tag filters (AND)', () => {
    expect(filterVideos(vids, { source: 'local' }).map((v) => v.id)).toEqual(['b']);
    expect(filterVideos(vids, { source: 'all', tags: ['kpop'] }).map((v) => v.id)).toEqual(['a', 'b']);
    expect(filterVideos(vids, { tags: ['kpop', '연습'] }).map((v) => v.id)).toEqual(['a']);
  });
  it('U-LIB-04 rename keeps originalTitle', () => {
    const r = renameVideo(ytVideo({ originalTitle: 'Orig' }), '  New ', new Date(0));
    expect(r).toMatchObject({ title: 'New', originalTitle: 'Orig' });
    expect(renameVideo(ytVideo({ originalTitle: 'Orig' }), '', new Date(0)).title).toBe('Orig');
  });
  it('U-LIB-05 tag autocomplete', () => {
    expect(allTags(vids)).toEqual(['연습', 'ballet', 'kpop']);
    expect(tagSuggestions(vids, 'K')).toEqual(['kpop']);
    expect(tagSuggestions(vids, '', ['kpop'])).toEqual(['연습', 'ballet']);
    expect(normalizeTags([' a', 'a', '', 'b '])).toEqual(['a', 'b']);
  });
});
