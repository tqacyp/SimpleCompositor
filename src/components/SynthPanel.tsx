import type { SynthParams, Waveform } from '../audio/voice';
import { Slider } from './Slider';

interface SynthPanelProps {
  params: SynthParams;
  onChange: (patch: Partial<SynthParams>) => void;
}

const WAVEFORMS: Array<{ id: Waveform; label: string }> = [
  { id: 'sine', label: '正弦' },
  { id: 'triangle', label: '三角' },
  { id: 'sawtooth', label: '锯齿' },
  { id: 'square', label: '方波' },
];

/** 波形的小示意图，纯装饰。 */
const WAVE_PATHS: Record<Waveform, string> = {
  sine: 'M0 10 L2 6.94 L4 4.34 L6 2.61 L8 2 L10 2.61 L12 4.34 L14 6.94 L16 10 L18 13.06 L20 15.66 L22 17.39 L24 18 L26 17.39 L28 15.66 L30 13.06 L32 10',
  triangle: 'M0 10 L6 2 L16 18 L26 2 L32 10',
  sawtooth: 'M0 16 L10 4 L10 16 L20 4 L20 16 L30 4 L30 16',
  square: 'M0 16 L0 4 L8 4 L8 16 L16 16 L16 4 L24 4 L24 16 L32 16',
};

export function SynthPanel({ params, onChange }: SynthPanelProps) {
  return (
    <section className="panel synth-panel">
      <h2 className="panel-title">音色</h2>

      <div className="wave-picker" role="group" aria-label="波形选择">
        {WAVEFORMS.map((wave) => (
          <button
            key={wave.id}
            type="button"
            className={`wave-btn ${params.waveform === wave.id ? 'is-active' : ''}`}
            onClick={() => onChange({ waveform: wave.id })}
            aria-pressed={params.waveform === wave.id}
          >
            <svg viewBox="0 0 32 20" width="32" height="20" aria-hidden="true">
              <path d={WAVE_PATHS[wave.id]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span>{wave.label}</span>
          </button>
        ))}
      </div>

      <div className="synth-sliders">
        <Slider
          label="起音 A"
          value={params.attack}
          min={0.003}
          max={1}
          step={0.001}
          display={`${Math.round(params.attack * 1000)} ms`}
          onChange={(attack) => onChange({ attack })}
        />
        <Slider
          label="衰减 D"
          value={params.decay}
          min={0.01}
          max={1}
          step={0.005}
          display={`${Math.round(params.decay * 1000)} ms`}
          onChange={(decay) => onChange({ decay })}
        />
        <Slider
          label="延音 S"
          value={params.sustain}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(params.sustain * 100)}%`}
          onChange={(sustain) => onChange({ sustain })}
        />
        <Slider
          label="释音 R"
          value={params.release}
          min={0.02}
          max={2}
          step={0.01}
          display={`${Math.round(params.release * 1000)} ms`}
          onChange={(release) => onChange({ release })}
        />
        <Slider
          label="截止频率"
          value={params.cutoff}
          min={200}
          max={16000}
          step={10}
          display={`${(params.cutoff / 1000).toFixed(1)} kHz`}
          onChange={(cutoff) => onChange({ cutoff })}
        />
        <Slider
          label="共振 Q"
          value={params.resonance}
          min={0.1}
          max={20}
          step={0.1}
          display={params.resonance.toFixed(1)}
          onChange={(resonance) => onChange({ resonance })}
        />
      </div>
    </section>
  );
}
