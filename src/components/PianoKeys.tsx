import { midiToName } from '../music/notes';

interface PianoKeysProps {
  /** 起始音高，默认 C4 = 60。铺满一个八度。 */
  baseMidi?: number;
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
}

/** 白键半音偏移，多带一个高八度 C 收尾。 */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12];

/** 黑键：偏移量 + 它右侧是第几个白键（用于定位）。 */
const BLACK_KEYS = [
  { offset: 1, afterWhite: 0 },
  { offset: 3, afterWhite: 1 },
  { offset: 6, afterWhite: 3 },
  { offset: 8, afterWhite: 4 },
  { offset: 10, afterWhite: 5 },
];

export function PianoKeys({ baseMidi = 60, onNoteOn, onNoteOff }: PianoKeysProps) {
  const whiteCount = WHITE_OFFSETS.length;

  return (
    <div className="piano" role="group" aria-label="钢琴键盘">
      {WHITE_OFFSETS.map((offset) => {
        const midi = baseMidi + offset;
        return (
          <button
            key={`white-${offset}`}
            type="button"
            className="key-white"
            aria-label={midiToName(midi)}
            onPointerDown={(event) => {
              event.preventDefault();
              onNoteOn(midi);
            }}
            onPointerUp={() => onNoteOff(midi)}
            onPointerLeave={() => onNoteOff(midi)}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className="key-label">{midiToName(midi)}</span>
          </button>
        );
      })}

      {BLACK_KEYS.map(({ offset, afterWhite }) => {
        const midi = baseMidi + offset;
        return (
          <button
            key={`black-${offset}`}
            type="button"
            className="key-black"
            style={{ left: `${((afterWhite + 1) / whiteCount) * 100}%` }}
            aria-label={midiToName(midi)}
            onPointerDown={(event) => {
              event.preventDefault();
              onNoteOn(midi);
            }}
            onPointerUp={() => onNoteOff(midi)}
            onPointerLeave={() => onNoteOff(midi)}
            onContextMenu={(event) => event.preventDefault()}
          />
        );
      })}
    </div>
  );
}
