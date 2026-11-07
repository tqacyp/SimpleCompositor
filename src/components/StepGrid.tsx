import { Fragment } from 'react';

import { midiToName } from '../music/notes';

interface StepGridProps {
  /** 从高到低的 MIDI 音高，每行一个音。 */
  rows: number[];
  /** pattern[row][step] */
  pattern: boolean[][];
  /** 正在播放的步，-1 表示停止。 */
  currentStep: number;
  onToggle: (row: number, step: number) => void;
}

export function StepGrid({ rows, pattern, currentStep, onToggle }: StepGridProps) {
  const stepCount = pattern[0]?.length ?? 16;
  const template = `64px repeat(${stepCount}, minmax(0, 1fr))`;

  return (
    <div className="grid-scroll">
      <div className="step-grid" style={{ gridTemplateColumns: template }}>
        <div className="grid-corner" />

        {Array.from({ length: stepCount }, (_, step) => (
          <div
            key={`head-${step}`}
            className={[
              'step-head',
              step % 4 === 0 ? 'is-beat' : '',
              step === currentStep ? 'is-current' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {step + 1}
          </div>
        ))}

        {rows.map((midi, row) => (
          <Fragment key={midi}>
            <div className={`row-label ${row % 2 === 0 ? 'is-alt' : ''}`}>{midiToName(midi)}</div>

            {pattern[row].map((on, step) => (
              <button
                key={step}
                type="button"
                aria-label={`${midiToName(midi)} 第 ${step + 1} 步`}
                aria-pressed={on}
                className={[
                  'step-cell',
                  on ? 'is-on' : '',
                  step % 4 === 0 ? 'is-beat' : '',
                  step === currentStep ? 'is-current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onToggle(row, step)}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
