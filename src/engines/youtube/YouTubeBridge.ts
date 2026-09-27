import { BridgeEvents, DEFAULT_RATES, Emitter, LoopSetting, MirrorConfig, PlayerBridge } from '../PlayerBridge';
import type { PlayerCommand, PlayerEvent } from './player/protocol';

export type CommandSender = (cmd: PlayerCommand) => void;

/**
 * PlayerBridge over the WebView player protocol. The target (in-app WebView or the external-display
 * WKWebView) can change; desired config is cached and replayed whenever a target reports `ready`.
 */
export class YouTubeBridge implements PlayerBridge {
  readonly kind = 'youtube' as const;
  private emitter = new Emitter<BridgeEvents>();
  private sender: CommandSender | null = null;
  private mirror: MirrorConfig = { baseMirror: false, segments: [] };
  private loop: LoopSetting = null;
  private rate = 1;
  private rates = DEFAULT_RATES;
  private playing = false;
  private resumeOnReady = false;
  /** A newly attached page cannot receive commands until it reports `ready`. */
  private targetReady = false;
  external = false;
  lastTime: number;

  constructor(
    readonly videoId: string,
    start = 0,
  ) {
    this.lastTime = start;
  }

  /** Connects a new target. Commands go to it once it reports `ready`. */
  attach(sender: CommandSender) {
    this.sender = sender;
    this.targetReady = false;
  }

  detach() {
    this.resumeOnReady = this.playing;
    this.sender = null;
    this.targetReady = false;
  }

  private send(cmd: PlayerCommand) {
    if (this.targetReady) this.sender?.(cmd);
    // Before `ready`, state is cached and replayed; only transport intent needs recording here.
    else if (cmd.type === 'play') this.resumeOnReady = true;
    else if (cmd.type === 'pause') this.resumeOnReady = false;
  }

  handleEvent(ev: PlayerEvent) {
    switch (ev.type) {
      case 'ready':
        this.targetReady = true;
        if (ev.rates?.length) this.rates = ev.rates;
        this.send({ type: 'setSegments', segments: this.mirror.segments, baseMirror: this.mirror.baseMirror });
        this.send({ type: 'setLoop', loop: this.loop });
        if (this.rate !== 1) this.send({ type: 'setRate', rate: this.rate });
        if (this.lastTime > 0) this.send({ type: 'seekTo', t: this.lastTime });
        if (this.resumeOnReady) this.send({ type: 'play' });
        this.resumeOnReady = false;
        this.emitter.emit('ready', { rates: this.rates, duration: ev.duration });
        break;
      case 'timeupdate':
        this.lastTime = ev.t;
        this.emitter.emit('time', { t: ev.t, duration: ev.duration });
        break;
      case 'stateChange':
        this.playing = ev.state === 'playing';
        this.emitter.emit('state', { state: ev.state });
        break;
      case 'mirror':
        this.emitter.emit('mirror', ev.transition);
        break;
      case 'loop':
        this.emitter.emit('loop', { count: ev.count, at: ev.at });
        break;
      case 'error':
        this.emitter.emit('error', { code: ev.code });
        break;
    }
  }

  /** Parses a raw WebView message; ignores anything that is not a player event. */
  handleMessage(data: string) {
    try {
      const ev = JSON.parse(data) as PlayerEvent;
      if (ev && typeof ev.type === 'string') this.handleEvent(ev);
    } catch {
      // not ours
    }
  }

  play() {
    this.send({ type: 'play' });
  }
  pause() {
    this.send({ type: 'pause' });
  }
  seekTo(t: number) {
    this.lastTime = Math.max(0, t);
    this.send({ type: 'seekTo', t: this.lastTime });
  }
  seekBy(delta: number) {
    this.send({ type: 'seekBy', delta });
  }
  setRate(rate: number) {
    this.rate = rate;
    this.send({ type: 'setRate', rate });
  }
  getAvailableRates() {
    return this.rates;
  }
  setMirrorConfig(cfg: MirrorConfig) {
    this.mirror = cfg;
    this.send({ type: 'setSegments', segments: cfg.segments, baseMirror: cfg.baseMirror });
  }
  setLoop(loop: LoopSetting) {
    this.loop = loop;
    this.send({ type: 'setLoop', loop });
  }
  setExternalMode(on: boolean) {
    this.external = on;
  }
  get isPlaying() {
    return this.playing;
  }
  on<K extends keyof BridgeEvents>(ev: K, cb: (p: BridgeEvents[K]) => void) {
    return this.emitter.on(ev, cb);
  }
}
