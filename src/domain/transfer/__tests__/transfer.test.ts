import { localVideo, ytVideo } from '../../../../test/fixtures';
import { applyImport, applyToAll, conflictKey, planImport } from '../conflicts';
import { buildExport, exportFileName } from '../exportJson';
import { parseImport } from '../importJson';
import { relink } from '../relink';

const deps = () => {
  let n = 0;
  return { uuid: () => `new-${++n}`, now: () => new Date('2026-09-28T00:00:00Z') };
};
const seg = (start: number, end: number) => ({ id: `s${start}`, start, end });

describe('export', () => {
  it('U-EX-01 strips device-specific fields', () => {
    const vids = [
      ytVideo({ lastPosition: 3, lastRate: 0.5, lastOpenedAt: 'x', thumbnail: 'https://i.ytimg.com/a.jpg' }),
      localVideo({ lastPosition: 3, thumbnail: 'thumb.jpg' }),
      localVideo({ id: 'l2', thumbnail: 'https://i.ytimg.com/b.jpg' }),
    ];
    const out = buildExport(vids, new Date('2026-09-27T12:00:00Z'));
    expect(out).toMatchObject({ format: 'yt-mirror-loop', schemaVersion: 1, exportedAt: '2026-09-27T12:00:00.000Z' });
    for (const f of ['lastPosition', 'lastRate', 'lastOpenedAt', 'fileName']) for (const v of out.videos) expect(v).not.toHaveProperty(f);
    expect(out.videos[0].thumbnail).toBe('https://i.ytimg.com/a.jpg');
    expect(out.videos[1]).not.toHaveProperty('thumbnail');
    expect(out.videos[2].thumbnail).toBe('https://i.ytimg.com/b.jpg');
  });
  it('U-EX-02 local-date file name', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59))).toBe('yt-mirror-loop-20260105.json');
  });
  it('U-EX-03 selected subset', () => {
    const out = buildExport([ytVideo(), localVideo()], new Date(), ['loc-1']);
    expect(out.videos.map((v) => v.id)).toEqual(['loc-1']);
  });
});

describe('import', () => {
  it('U-IM-01 invalid input rejected with a message', () => {
    expect(parseImport('{bad')).toMatchObject({ ok: false, message: expect.stringContaining('JSON') });
    expect(parseImport('{"format":"other"}')).toMatchObject({ ok: false });
    expect(parseImport('null')).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ format: 'yt-mirror-loop', schemaVersion: 7, exportedAt: 'x', videos: [] }))).toMatchObject({ ok: false, message: expect.stringContaining('새로운') });
    const bad = parseImport(JSON.stringify({ format: 'yt-mirror-loop', schemaVersion: 1, exportedAt: 'x', videos: [{ source: 'youtube' }] }));
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('올바르지') });
    const good = parseImport(JSON.stringify(buildExport([ytVideo()], new Date())));
    expect(good.ok).toBe(true);
  });
  it('U-IM-02 youtube keyed by videoId', () => {
    const plan = planImport([ytVideo({ id: 'e' })], [ytVideo({ id: 'i' })]);
    expect(plan.conflicts).toHaveLength(1);
    expect(conflictKey(ytVideo())).toBe('yt:dQw4w9WgXcQ');
  });
  it('U-IM-03 local with linkedVideoId matches youtube or local', () => {
    const inc = localVideo({ id: 'i', linkedVideoId: 'dQw4w9WgXcQ', fileSize: 1 });
    expect(planImport([ytVideo({ id: 'e' })], [inc]).conflicts[0].existing.id).toBe('e');
    expect(planImport([localVideo({ id: 'e2', linkedVideoId: 'dQw4w9WgXcQ', fileSize: 999 })], [inc]).conflicts[0].existing.id).toBe('e2');
    expect(planImport([localVideo({ id: 'e3', fileSize: 1 })], [inc]).conflicts).toHaveLength(0);
  });
  it('U-IM-04 local without link keyed by fingerprint', () => {
    expect(planImport([localVideo({ id: 'e' })], [localVideo({ id: 'i', fileName: undefined })]).conflicts).toHaveLength(1);
    expect(planImport([localVideo({ id: 'e' })], [localVideo({ id: 'i', fileSize: 7 })]).additions).toHaveLength(1);
  });
  it('U-IM-05 overwrite keeps fileName, replaces data', () => {
    const existing = [localVideo({ id: 'e', fileName: 'keep.mp4', memo: 'old', title: 'old' })];
    const inc = localVideo({ id: 'i', fileName: undefined, title: 'new', memo: 'm', tags: ['t'], segments: [seg(1, 2)], baseMirror: true });
    const plan = planImport(existing, [inc]);
    const out = applyImport(existing, plan, { i: 'overwrite' }, deps());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'e', fileName: 'keep.mp4', title: 'new', memo: 'm', tags: ['t'], segments: [seg(1, 2)], baseMirror: true });
    const noMemo = applyImport(existing, planImport(existing, [localVideo({ id: 'i' })]), { i: 'overwrite' }, deps());
    expect(noMemo[0]).not.toHaveProperty('memo');
  });
  it('U-IM-06 skip', () => {
    const existing = [ytVideo({ id: 'e', title: 'old' })];
    const out = applyImport(existing, planImport(existing, [ytVideo({ id: 'i', title: 'new' })]), { i: 'skip' }, deps());
    expect(out).toEqual(existing);
    expect(applyImport(existing, planImport(existing, [ytVideo({ id: 'i' })]), {}, deps())).toEqual(existing);
  });
  it('U-IM-07 copy → new uuid, both exist', () => {
    const existing = [ytVideo({ id: 'e' })];
    const out = applyImport(existing, planImport(existing, [ytVideo({ id: 'i' })]), { i: 'copy' }, deps());
    expect(out.map((v) => v.id)).toEqual(['e', 'new-1']);
  });
  it('U-IM-08 apply to all', () => {
    const existing = [ytVideo({ id: 'e1', videoId: 'aaaaaaaaaaa' }), ytVideo({ id: 'e2', videoId: 'bbbbbbbbbbb' }), ytVideo({ id: 'e3', videoId: 'ccccccccccc' })];
    const incoming = existing.map((v) => ({ ...v, id: `i-${v.id}` }));
    const plan = planImport(existing, incoming);
    const res = applyToAll(plan.conflicts, 'copy', { 'i-e1': 'skip' }, 1);
    expect(res).toEqual({ 'i-e1': 'skip', 'i-e2': 'copy', 'i-e3': 'copy' });
    expect(applyToAll(plan.conflicts, 'skip')).toEqual({ 'i-e1': 'skip', 'i-e2': 'skip', 'i-e3': 'skip' });
    expect(applyImport(existing, plan, res, deps())).toHaveLength(5);
  });
  it('U-IM-09 unmatched local → added without fileName; id clash gets new id', () => {
    const out = applyImport([ytVideo({ id: 'loc-1' })], planImport([ytVideo({ id: 'loc-1' , videoId: 'zzzzzzzzzzz'})], [localVideo({ fileName: 'x.mp4' })]), {}, deps());
    expect(out[1]).not.toHaveProperty('fileName');
    expect(out[1].id).toBe('new-1');
    const kept = applyImport([], planImport([], [localVideo({ id: 'orig' })]), {}, deps());
    expect(kept[0].id).toBe('orig');
  });
  it('U-RL-01 duration within ±0.5 s → linked', () => {
    const r = relink(localVideo({ fileName: undefined, durationMs: 60000 }), { fileName: 'f.mp4', durationMs: 60400, fileSize: 9, fps: 24, width: 1, height: 2 });
    expect(r).toMatchObject({ status: 'LINKED', video: { fileName: 'f.mp4', durationMs: 60400, fingerprint: '9:60400', fps: 24 } });
  });
  it('U-RL-02 mismatch → NEEDS_CONFIRM; confirm → linked', () => {
    const v = localVideo({ fileName: undefined, durationMs: 60000 });
    expect(relink(v, { fileName: 'f.mp4', durationMs: 10000, fileSize: 9 })).toEqual({ status: 'NEEDS_CONFIRM', diffMs: 50000 });
    const ok = relink(v, { fileName: 'f.mp4', durationMs: 10000, fileSize: 9 }, { confirmed: true, now: new Date(0) });
    expect(ok).toMatchObject({ status: 'LINKED', video: { fingerprint: '9:10000', updatedAt: '1970-01-01T00:00:00.000Z' } });
  });
});
