import { Slider } from './Slider';

interface TransportBarProps {
  isPlaying: boolean;
  bpm: number;
  volume: number;
  onToggle: () => void;
  onBpmChange: (bpm: number) => void;
  onVolumeChange: (volume: number) => void;
  onClear: () => void;
}

export function TransportBar({
  isPlaying,
  bpm,
  volume,
  onToggle,
  onBpmChange,
  onVolumeChange,
  onClear,
}: TransportBarProps) {
  return (
    <section className="transport panel">
      <button
        type="button"
        className={`play-btn ${isPlaying ? 'is-playing' : ''}`}
        onClick={onToggle}
        aria-label={isPlaying ? '停止播放' : '开始播放'}
      >
        {isPlaying ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 2.8v10.4a.6.6 0 0 0 .92.5l8.2-5.2a.6.6 0 0 0 0-1L4.92 2.3A.6.6 0 0 0 4 2.8Z" fill="currentColor" />
          </svg>
        )}
        <span>{isPlaying ? '停止' : '播放'}</span>
      </button>

      <div className="transport-fields">
        <Slider
          label="速度"
          value={bpm}
          min={50}
          max={200}
          step={1}
          display={`${bpm} BPM`}
          onChange={onBpmChange}
        />
        <Slider
          label="总音量"
          value={volume}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(volume * 100)}%`}
          onChange={onVolumeChange}
        />
      </div>

      <button type="button" className="ghost-btn" onClick={onClear}>
        清空
      </button>
    </section>
  );
}
