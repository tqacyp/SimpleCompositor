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
  /** 正在进行的 resume 调用，避免并发手势重复恢复。 */
  private pending: Promise<void> | null = null;

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
      // 并发调用（比如快速连点）只保留一个 resume。
      this.pending ??= this.ctx.resume().finally(() => {
        this.pending = null;
      });
      await this.pending;
    }

    return this.ctx;
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
