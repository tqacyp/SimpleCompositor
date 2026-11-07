/**
 * 节奏数据模型。
 *
 * 从"布尔网格"换成音符列表，是因为音符时值变成了变量：
 * 一个音符必须有起点和长度，才能表达 1/16 到 1/1 以及附点。
 * 网格只负责显示，真相是这份列表。
 */

export interface Note {
  id: number;
  /** 行号，索引到音序器的音高表。 */
  row: number;
  /** 起点，单位是十六分音符格。 */
  start: number;
  /** 长度，单位是十六分音符格。 */
  length: number;
}

/** 一小节固定 16 格（十六分音符）。 */
export const STEPS_PER_BAR = 16;

/** 音序器的音高行，从高到低：C5 A4 G4 E4 D4 C4 A3 G3（C 大调五声音阶）。 */
export const ROWS = [72, 69, 67, 64, 62, 60, 57, 55];

let idCounter = 0;
export const nextNoteId = () => ++idCounter;

const DURATION_LABELS: Record<number, string> = {
  1: '1/16',
  2: '1/8',
  3: '1/8·',
  4: '1/4',
  6: '1/4·',
  8: '1/2',
  12: '1/2·',
  16: '1/1',
  24: '1/1·',
};

export const durationLabel = (steps: number): string =>
  DURATION_LABELS[steps] ?? `${steps} 格`;

/** 初始演示：故意包含 1/8、1/4、附点、1/2，让时值差异一眼可见。 */
export function createSeedNotes(): Note[] {
  return [
    { row: 5, start: 0, length: 4 },
    { row: 3, start: 4, length: 2 },
    { row: 2, start: 6, length: 2 },
    { row: 3, start: 8, length: 6 },
    { row: 0, start: 14, length: 2 },
    { row: 2, start: 16, length: 8 },
    { row: 4, start: 24, length: 4 },
    { row: 3, start: 28, length: 4 },
  ].map((note) => ({ ...note, id: nextNoteId() }));
}

export function findNoteAt(notes: Note[], row: number, step: number): Note | null {
  return (
    notes.find(
      (note) => note.row === row && step >= note.start && step < note.start + note.length,
    ) ?? null
  );
}

/**
 * 同一行里，从 start 开始最多能放多长。
 * 上限取"下一个音符的起点"和"循环末尾"两者中更早的那个。
 */
export function maxLengthFor(notes: Note[], row: number, start: number, total: number): number {
  const nextStart = notes
    .filter((note) => note.row === row && note.start > start)
    .reduce((min, note) => Math.min(min, note.start), total);
  return Math.max(1, Math.min(nextStart, total) - start);
}

/** 小节数变少时裁掉越界音符，并截断跨出末尾的长度。 */
export function clampNotes(notes: Note[], total: number): Note[] {
  return notes
    .filter((note) => note.start < total)
    .map((note) => ({ ...note, length: Math.min(note.length, total - note.start) }));
}
