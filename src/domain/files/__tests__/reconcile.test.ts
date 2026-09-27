import { localVideo, ytVideo } from '../../../../test/fixtures';
import { isMissingFile, reconcile } from '../reconcile';

describe('reconcile', () => {
  it('U-REC-01 unreferenced file → orphan', () => {
    const r = reconcile([localVideo({ fileName: 'a.mp4' })], ['a.mp4', 'b.mp4']);
    expect(r.orphans).toEqual(['b.mp4']);
    expect(r.changed).toBe(false);
  });
  it('U-REC-02 referenced file missing → fileName cleared', () => {
    const r = reconcile([localVideo({ id: 'x', fileName: 'a.mp4' }), ytVideo()], []);
    expect(r.missingIds).toEqual(['x']);
    expect(r.videos[0]).not.toHaveProperty('fileName');
    expect(isMissingFile(r.videos[0])).toBe(true);
    expect(isMissingFile(r.videos[1])).toBe(false);
    expect(r.changed).toBe(true);
  });
  it('U-REC-03 consistent → no-op', () => {
    const vids = [localVideo({ fileName: 'a.mp4' }), ytVideo(), localVideo({ id: 'n', fileName: undefined })];
    const r = reconcile(vids, ['a.mp4']);
    expect(r).toEqual({ videos: vids, orphans: [], missingIds: [], changed: false });
  });
});
