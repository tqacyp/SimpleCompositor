/**
 * 步进音序器调度器 —— "两份时钟"模式的实现。
 *
 * 为什么不能直接用 setInterval 决定发声时刻：
 *   1. 定时器抖动可达几十毫秒，节奏会飘；
 *   2. 后台标签页里定时器被节流到约 1 次/秒，节奏直接崩掉。
 *
 * 所以定时器只负责"提前预约"：每 25ms 醒一次，把未来 120ms 内该响的
 * 音符全部按**精确的音频时钟时间**排进 Web Audio。真正的发声时刻由
 * 音频线程决定，与 JS 卡顿无关。
 *
 * 可视化的高亮反过来走：把已排期的事件放进队列，由 rAF 每帧对照
 * ctx.currentTime 取出"已经到期"的事件，这样画面和声音是对齐的。
 */

export interface StepEvent {
  step: number;
  time: number;
}

/** 定时器间隔（ms）。越小越不易断粮，但唤醒越频繁。 */
const TICK_MS = 25;

/** 预约窗口（秒）。必须明显大于一次 tick 的间隔。 */
const LOOKAHEAD = 0.12;

export class StepScheduler {
  /** 每分钟拍数。 */
  bpm = 120;

  /** 一个循环有多少步。 */
  steps = 16;

  /** 每拍拆成几步，4 = 十六分音符。 */
  subdivision = 4;

  private timer: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private queue: StepEvent[] = [];
  private onStep: ((step: number, time: number) => void) | null = null;

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** 每一步的时长（秒）。 */
  get secondsPerStep(): number {
    return 60 / this.bpm / this.subdivision;
  }

  start(ctx: AudioContext, onStep: (step: number, time: number) => void): void {
    this.stop();
    this.onStep = onStep;
    this.stepIndex = 0;
    this.queue = [];
    // 留一点启动余量，确保第一个音符不会落在过去。
    this.nextStepTime = ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.pump(ctx), TICK_MS);
    this.pump(ctx);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }

  /**
   * 取出所有已到期的事件，返回最后一次跨越的步号。
   * 由 rAF 每帧调用，用于驱动 UI 高亮。
   */
  drainDue(ctx: AudioContext): number {
    let latest = -1;
    while (this.queue.length > 0 && this.queue[0].time <= ctx.currentTime) {
      latest = this.queue.shift()!.step;
    }
    // 队列不应超过一个循环的量；超了说明 UI 长时间没跑，直接清空。
    if (this.queue.length > this.steps * 2) this.queue = [];
    return latest;
  }

  private pump(ctx: AudioContext): void {
    // 后台标签页被节流后，nextStepTime 可能已经远远落后于实时时钟。
    // 这时如果继续补排，会把一堆过去的时间点塞给 Web Audio，导致瞬间齐响。
    // 直接把时钟对齐到"现在"，宁可丢一小段也不炸音。
    if (this.nextStepTime < ctx.currentTime) {
      this.nextStepTime = ctx.currentTime + 0.03;
    }

    const horizon = ctx.currentTime + LOOKAHEAD;
    if (this.bpm <= 0) return;

    while (this.nextStepTime < horizon) {
      this.onStep?.(this.stepIndex, this.nextStepTime);
      this.queue.push({ step: this.stepIndex, time: this.nextStepTime });

      this.nextStepTime += this.secondsPerStep;
      this.stepIndex = (this.stepIndex + 1) % this.steps;
    }
  }
}
