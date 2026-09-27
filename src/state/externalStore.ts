import { create } from 'zustand';

import MirrorPlayer from '../../modules/mirror-player';

type ExternalState = { connected: boolean; fake: boolean; init(): () => void; setFake(on: boolean): Promise<void> };

/** AirPlay screen mirroring / external display status reported by the native module. */
export const useExternal = create<ExternalState>((set) => ({
  connected: false,
  fake: false,
  init() {
    const sub = MirrorPlayer.addListener('onExternalDisplay', (p) => set({ connected: p.connected, fake: p.connected && p.fake }));
    MirrorPlayer.isExternalDisplayConnected()
      .then((p) => set({ connected: p.connected, fake: p.fake }))
      .catch(() => {});
    return () => sub.remove();
  },
  async setFake(on) {
    await MirrorPlayer.setFakeExternalDisplay(on);
  },
}));
