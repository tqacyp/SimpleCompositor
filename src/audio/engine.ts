/**
 * 音频引擎：全局唯一的 AudioContext + 主总线。
 *
 * 刻意做成"React 之外的单例"：
 *   - 音频节点树与 React 渲染树完全解耦，React 重渲染不会重建节点。
 *   - 多声部发声只创建临时节点，结束后自行 disconnect，不留垃圾。
 *   - 这样后期加效果器、加轨道，也不会因为 state 变化而卡顿。
 *
 * 总线：voices -> bus(Gain) -> compressor -> master(Gain) -> destination
 * 压缩器不是可选装饰，它是多声部叠加不削顶的安全网。
 */

import { playVoice, type SynthParams, type VoiceHandle } from './voice';

type AudioContextCtor = typeof AudioContext;

function resolveContextCtor(): AudioContextCtor {
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!ctor) {
    throw new Error('当前浏览器不支持 Web Audio API');
  }
  return ctor;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private voiceBus: GainNode | null = null;
  private masterGain: GainNode | null = null;

  /** 已就绪的上下文；未启动时为 null。 */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  get masterVolume(): number {
    return this.masterGain?.gain.value ?? 0.75;
  }

  /**
   * 创建（或恢复）音频上下文。
   * 必须在用户手势的回调里调用，否则会被浏览器的自动播放策略拦截。
   */
  async start(): Promise<AudioContext> {
    if (!this.ctx) {
      // iOS 16.4+ / Safari：不声明 playback 的话，手机侧边静音拨片打开时
      // 网页音频会被整体静音。声明后走媒体通道（音乐类应用的常规做法）。
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';

      const ctx = new (resolveContextCtor())({ latencyHint: 'interactive' });
      const bus = ctx.createGain();
      bus.gain.value = 0.9;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      const master = ctx.createGain();
      master.gain.value = 0.75;

      bus.connect(compressor).connect(master).connect(ctx.destination);

      this.ctx = ctx;
      this.voiceBus = bus;
      this.masterGain = master;
    }

    if (this.ctx.state !== 'running') {
      // 这两步都必须在手势回调的**同步段**里执行，不能挪到 await 之后。
      this.playSilentFrame(this.ctx);
      try {
        await this.ctx.resume();
      } catch {
        // 个别浏览器在非手势环境下会拒绝恢复，留给下一次手势重试。
      }
    }

    return this.ctx;
  }

  /**
   * iOS Safari 的音频会话解锁条件：必须在用户手势里真的播出一点声音。
   * 部分版本上单纯 resume() 不够，所以补一个 1 帧静音 buffer。
   */
  private playSilentFrame(ctx: AudioContext): void {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.onended = () => source.disconnect();
    source.start(0);
  }

  setMasterVolume(value: number): void {
    if (!this.masterGain || !this.ctx) return;
    const clamped = Math.min(Math.max(value, 0), 1);
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
  }

  /**
   * 立刻发声（实时演奏用）。
   * @returns 可提前松键的句柄；引擎未启动时返回 null。
   */
  playNow(params: SynthParams, midi: number, duration: number, velocity = 1): VoiceHandle | null {
    if (!this.ctx || !this.voiceBus) return null;
    // 留 10ms 余量，避免 startTime 略微落后于当前时钟。
    return this.playAt(params, midi, this.ctx.currentTime + 0.01, duration, velocity);
  }

  /** 在指定的音频时钟时刻发声（音序器用）。 */
  playAt(
    params: SynthParams,
    midi: number,
    when: number,
    duration: number,
    velocity = 1,
  ): VoiceHandle | null {
    if (!this.ctx || !this.voiceBus) return null;
    return playVoice(this.ctx, this.voiceBus, midi, when, duration, velocity, params);
  }

  async dispose(): Promise<void> {
    if (!this.ctx) return;
    await this.ctx.close();
    this.ctx = null;
    this.voiceBus = null;
    this.masterGain = null;
  }
}

/** 应用内共用的引擎实例。 */
export const engine = new AudioEngine();
