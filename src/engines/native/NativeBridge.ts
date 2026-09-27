import MirrorPlayer from '../../../modules/mirror-player';
import { BridgeEvents, DEFAULT_RATES, Emitter, LoopSetting, MirrorConfig, PlayerBridge } from '../PlayerBridge';

type Module = typeof MirrorPlayer;

/** PlayerBridge over the MirrorPlayer native module (single shared AVPlayer). */
export class NativeBridge implements PlayerBridge {
  readonly kind = 'local' as const;
  private emitter = new Emitter<BridgeEvents>();
  private subs: { remove(): void }[] = [];
  private loadedUri: string | null = null;

  constructor(private mod: Module = MirrorPlayer) {
    this.subs = [
      mod.addListener('onTime', (p) => this.emitter.emit('time', p)),
      mod.addListener('onState', (p) => this.emitter.emit('state', p)),
      mod.addListener('onMirror', (p) => this.emitter.emit('mirror', p)),
      mod.addListener('onLoop', (p) => this.emitter.emit('loop', p)),
    ];
  }

  /** Idempotent per file: remounting the view (e.g. switching to the external-display layout) keeps position. */
  async load(fileUri: string, fps?: number) {
    if (this.loadedUri === fileUri) return;
    this.loadedUri = fileUri;
    try {
      const { duration } = await this.mod.load(fileUri, fps ?? null);
      this.emitter.emit('ready', { rates: DEFAULT_RATES, duration });
    } catch (e) {
      this.loadedUri = null;
      this.emitter.emit('error', { code: 'LOAD_FAILED', message: (e as Error).message });
    }
  }

  play() {
    this.mod.play();
  }
  pause() {
    this.mod.pause();
  }
  seekTo(sec: number) {
    this.mod.seekTo(Math.max(0, sec));
  }
  seekBy(delta: number) {
    this.mod.seekBy(delta);
  }
  stepFrames(n: number) {
    this.mod.stepFrames(n);
  }
  setRate(rate: number) {
    this.mod.setRate(rate);
  }
  getAvailableRates() {
    return DEFAULT_RATES;
  }
  setMirrorConfig(cfg: MirrorConfig) {
    this.mod.setMirrorConfig(
      cfg.baseMirror,
      cfg.segments.map((s) => [s.start, s.end]),
    );
  }
  setLoop(loop: LoopSetting) {
    if (loop && loop.enabled && loop.a < loop.b) this.mod.setLoop(loop.a, loop.b, true);
    else this.mod.clearLoop();
  }
  setExternalMode(on: boolean) {
    this.mod.setExternalContent(on ? 'local' : 'none', null, null);
  }
  on<K extends keyof BridgeEvents>(ev: K, cb: (p: BridgeEvents[K]) => void) {
    return this.emitter.on(ev, cb);
  }
  dispose() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this.emitter.clear();
    this.loadedUri = null;
    this.mod.unload();
  }
}
