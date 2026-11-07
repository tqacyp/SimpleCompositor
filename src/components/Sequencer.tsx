import { useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { midiToName } from '../music/notes';
import { durationLabel, ROWS, STEPS_PER_BAR, type Note } from '../music/pattern';

/** 一格的宽度（px）：30px 方块 + 4px 间隙。 */
const CELL = 34;
const LABEL_WIDTH = 56;

interface SequencerProps {
  notes: Note[];
  bars: number;
  /** 两次点击模式：已确定的起点。 */
  anchor: { row: number; step: number } | null;
  /** 两次点击模式：当前指针所在的格，用来画预览范围。 */
  hoverStep: number | null;
  /** 正在播放的格，-1 表示停止。 */
  currentStep: number;
  onCellDown: (row: number, step: number) => void;
  onCellHover: (row: number, step: number) => void;
}

export function Sequencer({
  notes,
  bars,
  anchor,
  hoverStep,
  currentStep,
  onCellDown,
  onCellHover,
}: SequencerProps) {
  const total = bars * STEPS_PER_BAR;
  const trackWidth = total * CELL;

  // 格子是纯装饰且随小节数变化，缓存住能让指针移动时的重渲染只更新音符层。
  const cells = useMemo(
    () =>
      Array.from({ length: total }, (_, step) => (
        <div
          key={step}
          className={[
            'seq-cell',
            step % 4 === 0 ? 'is-beat' : '',
            step % STEPS_PER_BAR === 0 ? 'is-bar' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )),
    [total],
  );

  const ghost = anchor
    ? {
        row: anchor.row,
        from: Math.min(anchor.step, hoverStep ?? anchor.step),
        to: Math.max(anchor.step, hoverStep ?? anchor.step),
      }
    : null;

  const stepFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    return Math.min(total - 1, Math.max(0, Math.floor(x / CELL)));
  };

  return (
    <div className="seq-scroll">
      <div className="seq-canvas" style={{ width: LABEL_WIDTH + trackWidth }}>
        <div className="seq-row seq-ruler-row">
          <div className="seq-row-label seq-corner">小节</div>
          <div className="seq-ruler-track" style={{ width: trackWidth }}>
            {Array.from({ length: bars }, (_, bar) => (
              <span
                key={bar}
                className="seq-bar-num"
                style={{ left: bar * STEPS_PER_BAR * CELL, width: STEPS_PER_BAR * CELL }}
              >
                {bar + 1}
              </span>
            ))}
          </div>
        </div>

        {ROWS.map((midi, row) => (
          <div className="seq-row" key={midi}>
            <div className="seq-row-label">{midiToName(midi)}</div>
            <div
              className="seq-track"
              style={{ width: trackWidth }}
              onPointerDown={(event) => onCellDown(row, stepFromEvent(event))}
              onPointerMove={(event) => onCellHover(row, stepFromEvent(event))}
            >
              {cells}

              {currentStep >= 0 && (
                <div className="seq-playhead" style={{ left: currentStep * CELL }} />
              )}

              {notes
                .filter((note) => note.row === row)
                .map((note) => (
                  <div
                    key={note.id}
                    className="seq-note"
                    style={{
                      left: note.start * CELL + 2,
                      width: note.length * CELL - 4,
                    }}
                  >
                    {note.length >= 2 && <span>{durationLabel(note.length)}</span>}
                  </div>
                ))}

              {ghost && ghost.row === row && (
                <div
                  className="seq-ghost"
                  style={{
                    left: ghost.from * CELL + 2,
                    width: (ghost.to - ghost.from + 1) * CELL - 4,
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
