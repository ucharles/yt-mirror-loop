import { File } from 'expo-file-system';

import { copyIntoVideos, fixtureUri, makeImportPorts, readTextFile, wipeLocalMedia } from '@/platform/files';
import { useExternal } from '@/state/externalStore';
import { useLibrary } from '@/state/libraryStore';
import { usePlayer } from '@/state/playerStore';
import { useSettings } from '@/state/settingsStore';

import { configureFlows, relinkVideo, runLocalImport, setMessage, startJsonImport, useFlows } from './flows';

/** `import-fixture?name=a.mp4&slow=1` (optionally prefixed with `ytmirror://e2e/`) → command + params. */
export function parseE2ECommand(input: string): { cmd: string; params: Record<string, string> } {
  const text = input.trim().replace(/^ytmirror:\/\/e2e\//, '');
  const [cmd, query = ''] = text.split('?');
  const params: Record<string, string> = {};
  for (const pair of query.split('&').filter(Boolean)) {
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return { cmd, params };
}

/** Debug deep links (`ytmirror://e2e/<cmd>?...`, TEST_PLAN hook 2). Fixtures live in Documents/e2e-fixtures. */
export async function runE2ECommand(cmd: string, params: Record<string, string | undefined>): Promise<void> {
  switch (cmd) {
    case 'reset':
      await useExternal.getState().setFake(false).catch(() => {});
      usePlayer.getState().bridge?.pause();
      useLibrary.getState().reset();
      useSettings.getState().reset();
      wipeLocalMedia();
      setMessage(null);
      useFlows.setState({ plan: null, conflictIndex: 0, resolutions: {} });
      return;
    case 'import-fixture': {
      const name = params.name ?? '';
      const uri = fixtureUri(name);
      const size = new File(uri).size;
      // `slow=1` copies in 10 throttled steps so the progress UI is observable.
      configureFlows({
        ports: () =>
          params.slow === '1'
            ? makeImportPorts({ copy: (s, d, p, sig) => copyIntoVideos(s, d, p, sig, { chunkSize: Math.ceil(size / 10), delayMs: 400 }) })
            : makeImportPorts(),
      });
      await runLocalImport([{ uri, name, size }]);
      return;
    }
    case 'import-json':
      startJsonImport(await readTextFile(fixtureUri(params.name ?? '')));
      return;
    case 'relink-fixture': {
      const name = params.name ?? '';
      const id = params.id ?? useLibrary.getState().videos.find((v) => v.source === 'local' && !v.fileName)?.id;
      if (id) await relinkVideo(id, { uri: fixtureUri(name), name });
      return;
    }
    case 'seek':
      usePlayer.getState().seekTo(Number(params.t ?? 0));
      return;
    case 'play':
      usePlayer.getState().bridge?.play();
      return;
    case 'pause':
      usePlayer.getState().bridge?.pause();
      return;
    case 'fake-external':
      await useExternal.getState().setFake(params.on === '1');
      return;
  }
}
