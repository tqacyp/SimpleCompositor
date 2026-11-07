/**
 * 音高工具：MIDI 音高编号 <-> 频率 / 音名。
 *
 * MIDI 69 = A4 = 440Hz，每升高一个半音频率乘以 2^(1/12)。
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI 60 -> "C4"（科学音高记法中 C4 = 中央 C）。 */
export function midiToName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}
