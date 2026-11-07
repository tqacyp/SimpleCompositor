/**
 * 单音发声：振荡器 -> 低通滤波 -> ADSR 音量包络 -> 目的地。
 *
 * 整个文件的关键词是"不出咔哒声"。产生 click 的唯一原因，是增益或波形
 * 在某个瞬间发生了不连续跳变。所以这里做了两件事：
 *
 *  1. 音量包络只用 setValueAtTime + exponentialRampToValueAtTime 构造，
 *     所有端点都是严格递增的时间点，绝不留下跳变。
 *  2. exponentialRamp 不能碰 0（数学上无解），因此用 SILENCE = 1e-4
 *     代替 0 —— 这个电平在人耳听来就是静音。
 *
 * 另外音符长度可能比 attack+decay 还短，所以包络拐点要先在 JS 里算好，
 * 再整体交给 Web Audio 自动化，而不是边播边中途 cancel。
 */

import { midiToFrequency } from '../music/notes';

export type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface SynthParams {
  waveform: Waveform;
  /** 起音，秒 */
  attack: number;
  /** 衰减，秒 */
  decay: number;
  /** 延音电平，0..1（相对于峰值） */
  sustain: number;
  /** 释音，秒 */
  release: number;
  /** 低通截止频率，Hz */
  cutoff: number;
  /** 低通共振 Q */
  resonance: number;
}

/** 听感上的静音。exponentialRamp 不能到 0，用这个值兜底。 */
const SILENCE = 0.0001;

/** 单振荡器振幅。两个振荡器叠加后峰值约为 2 倍，这里是混音余量。 */
const VOICE_GAIN = 0.1;

/** 两路失谐量（音分）。单振荡器太单薄，±7 音分能立刻变厚。 */
const UNISON_CENTS = 7;

/** 起音不能为 0，否则就是一次阶跃 = 咔哒声。 */
const MIN_ATTACK = 0.003;
const MIN_DECAY = 0.01;
const MIN_RELEASE = 0.02;

export const DEFAULT_SYNTH: SynthParams = {
  waveform: 'sawtooth',
  attack: 0.01,
  decay: 0.18,
  sustain: 0.55,
  release: 0.22,
  cutoff: 3200,
  resonance: 4,
};

/**
 * 包络拐点：返回严格递增的 [时间, 增益] 序列。
 * 长度插值全部按 exponential ramp 的数学形式计算，保证中途截断也连续。
 */
function buildEnvelope(
  startTime: number,
  duration: number,
  peak: number,
  sustain: number,
  attack: number,
  decay: number,
  release: number,
): Array<[number, number]> {
  const attackEnd = startTime + attack;
  const decayEnd = attackEnd + decay;
  const releaseStart = Math.max(startTime + duration, startTime + 0.02);
  const releaseEnd = releaseStart + release;

  // 复现 exponentialRampToValueAtTime 的曲线，用来取中途某点的值。
  const valueAt = (t: number): number => {
    if (t <= startTime) return SILENCE;
    if (t < attackEnd) {
      return SILENCE * Math.pow(peak / SILENCE, (t - startTime) / attack);
    }
    if (t < decayEnd) {
      return peak * Math.pow(sustain / peak, (t - attackEnd) / decay);
    }
    return sustain;
  };

  const points: Array<[number, number]> = [[startTime, SILENCE]];

  if (releaseStart >= decayEnd) {
    points.push([attackEnd, peak]);
    points.push([decayEnd, sustain]);
    if (releaseStart > decayEnd) points.push([releaseStart, sustain]);
  } else if (releaseStart >= attackEnd) {
    points.push([attackEnd, peak]);
    points.push([releaseStart, valueAt(releaseStart)]);
  } else {
    // 音符比起音还短：直接截在起音曲线上。
    points.push([releaseStart, valueAt(releaseStart)]);
  }

  points.push([releaseEnd, SILENCE]);
  return points;
}

export interface VoiceHandle {
  /** 提前松键。已释放过则无副作用。 */
  release: () => void;
}

/**
 * 在 `startTime` 开始一个音符。
 *
 * @param duration  音符持续多久（秒），不含 release 尾巴
 * @param velocity  力度 0..1
 * @returns 可用于"提前松开"的句柄
 */
export function playVoice(
  ctx: AudioContext,
  destination: AudioNode,
  midi: number,
  startTime: number,
  duration: number,
  velocity: number,
  params: SynthParams,
): VoiceHandle {
  // 音符比起音还短时，长起音会让整段几乎听不见（50ms 的音配 500ms 起音，
  // 只能升到峰值的 10%）。把 A/D 压进音符长度内，保证再短的音也能到达峰值：
  // 听感上比"数学正确但没声音"合理得多。实时演奏传的是长时长，不受影响。
  const noteLength = Math.max(duration, 0.02);
  const attack = Math.min(Math.max(params.attack, MIN_ATTACK), noteLength * 0.5);
  const decay = Math.min(Math.max(params.decay, MIN_DECAY), noteLength - attack);
  const release = Math.max(params.release, MIN_RELEASE);

  const peak = Math.max(velocity, 0.02) * VOICE_GAIN;
  const sustain = Math.max(peak * params.sustain, SILENCE);

  const amp = ctx.createGain();
  const points = buildEnvelope(startTime, noteLength, peak, sustain, attack, decay, release);

  let first = true;
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const [time, value] of points) {
    if (time <= previousTime) continue;
    previousTime = time;
    if (first) {
      amp.gain.setValueAtTime(SILENCE, time);
      first = false;
    } else {
      amp.gain.exponentialRampToValueAtTime(Math.max(value, SILENCE), time);
    }
  }

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(params.cutoff, startTime);
  filter.Q.setValueAtTime(params.resonance, startTime);

  filter.connect(amp);
  amp.connect(destination);

  const frequency = midiToFrequency(midi);
  const stopTime = releaseTimeOf(points) + 0.02;

  const oscillators = [-UNISON_CENTS, UNISON_CENTS].map((cents) => {
    const osc = ctx.createOscillator();
    osc.type = params.waveform;
    osc.frequency.setValueAtTime(frequency, startTime);
    osc.detune.setValueAtTime(cents, startTime);
    osc.connect(filter);
    osc.start(startTime);
    osc.stop(stopTime);
    return osc;
  });

  let released = false;
  let tornDown = false;

  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    for (const osc of oscillators) osc.disconnect();
    filter.disconnect();
    amp.disconnect();
  };

  // 两个振荡器同时停，监听第一个即可。
  oscillators[0].onended = teardown;

  return {
    release: () => {
      if (released) return;
      released = true;

      const now = ctx.currentTime;
      if (now >= stopTime) return;

      // 先读当前值再取消自动化，顺序不能反。
      const current = Math.max(amp.gain.value, SILENCE);
      amp.gain.cancelScheduledValues(now);
      amp.gain.setValueAtTime(current, now);
      amp.gain.exponentialRampToValueAtTime(SILENCE, now + release);

      const stopAt = Math.min(now + release + 0.02, stopTime);
      for (const osc of oscillators) osc.stop(stopAt);
    },
  };
}

function releaseTimeOf(points: Array<[number, number]>): number {
  return points[points.length - 1][0];
}
