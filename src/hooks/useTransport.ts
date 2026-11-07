import { useCallback, useEffect, useRef, useState } from 'react';

import { engine } from '../audio/engine';
import { StepScheduler } from '../audio/scheduler';

interface TransportOptions {
  bpm: number;
  steps: number;
  /** 每一步被调度时调用。time 是精确的 AudioContext 时钟时刻。 */
  onStep: (step: number, time: number) => void;
}

/**
 * 把 StepScheduler 接到 React 上。
 *
 * 分工很重要：
 *   - 音频调度完全在 React 之外跑，状态更新只用于画高亮；
 *   - 所以即使 UI 掉帧，节奏也不会受影响。
 */
export function useTransport({ bpm, steps, onStep }: TransportOptions) {
  // 惰性创建，保证组件重渲染不会换掉调度器。
  const [scheduler] = useState(() => new StepScheduler());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);

  // 让调度器始终读到最新的回调，而不必重启调度。
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  useEffect(() => {
    scheduler.bpm = bpm;
  }, [scheduler, bpm]);

  useEffect(() => {
    scheduler.steps = steps;
  }, [scheduler, steps]);

  const play = useCallback(async () => {
    const ctx = await engine.start();
    scheduler.start(ctx, (step, time) => onStepRef.current(step, time));
    setIsPlaying(true);
  }, [scheduler]);

  const stop = useCallback(() => {
    scheduler.stop();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, [scheduler]);

  const toggle = useCallback(() => {
    if (scheduler.isRunning) stop();
    else void play();
  }, [scheduler, play, stop]);

  // 用 rAF 把"已到期"的步号取出来驱动 UI，画面跟音频时钟对齐。
  useEffect(() => {
    if (!isPlaying) return;

    let frame = 0;
    const tick = () => {
      const ctx = engine.context;
      if (ctx) {
        const step = scheduler.drainDue(ctx);
        if (step >= 0) setCurrentStep(step);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, scheduler]);

  useEffect(() => () => scheduler.stop(), [scheduler]);

  return { isPlaying, currentStep, play, stop, toggle };
}
