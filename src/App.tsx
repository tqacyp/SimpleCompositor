import { useCallback, useEffect, useRef, useState } from 'react';

import { engine } from './audio/engine';
import { DEFAULT_SYNTH, type SynthParams } from './audio/voice';
import { HelpTip } from './components/HelpTip';
import { PianoKeys } from './components/PianoKeys';
import { Segmented } from './components/Segmented';
import { Sequencer } from './components/Sequencer';
import { SynthPanel } from './components/SynthPanel';
import { TransportBar } from './components/TransportBar';
import { useTransport } from './hooks/useTransport';
import {
  clampNotes,
  createSeedNotes,
  maxLengthFor,
  findNoteAt,
  nextNoteId,
  ROWS,
  STEPS_PER_BAR,
  type Note,
} from './music/pattern';

type EditMode = 'range' | 'brush';

const BARS_OPTIONS = [1, 2, 4, 8].map((value) => ({ value, label: String(value) }));

const MODE_OPTIONS: Array<{ value: EditMode; label: string }> = [
  { value: 'range', label: '两次点击' },
  { value: 'brush', label: '刷子' },
];

const DURATION_OPTIONS = [
  { value: 1, label: '1/16' },
  { value: 2, label: '1/8' },
  { value: 4, label: '1/4' },
  { value: 8, label: '1/2' },
  { value: 16, label: '1/1' },
];

export default function App() {
  const [notes, setNotes] = useState<Note[]>(createSeedNotes);
  const [bars, setBars] = useState(2);
  const [mode, setMode] = useState<EditMode>('range');
  const [brushBase, setBrushBase] = useState(2);
  const [brushDotted, setBrushDotted] = useState(false);
  const [anchor, setAnchor] = useState<{ row: number; step: number } | null>(null);
  const [hoverStep, setHoverStep] = useState<number | null>(null);

  const [params, setParams] = useState<SynthParams>(DEFAULT_SYNTH);
  const [bpm, setBpm] = useState(112);
  const [volume, setVolume] = useState(0.75);
  const [audioReady, setAudioReady] = useState(false);

  const total = bars * STEPS_PER_BAR;
  const brushLength = brushDotted && brushBase >= 2 ? Math.round(brushBase * 1.5) : brushBase;

  // 调度回调在 React 之外执行，必须通过 ref 读到最新状态。
  const liveRef = useRef({ notes, params, bpm, volume });
  useEffect(() => {
    liveRef.current = { notes, params, bpm, volume };
  });

  /** 每一步只触发"起点在这一格"的音符，长度决定发声多久。 */
  const handleStep = useCallback((step: number, time: number) => {
    const current = liveRef.current;
    const stepDuration = 60 / current.bpm / 4;

    for (const note of current.notes) {
      if (note.start !== step) continue;
      engine.playAt(
        current.params,
        ROWS[note.row],
        time,
        note.length * stepDuration * 0.95,
        0.9,
      );
    }
  }, []);

  const { isPlaying, currentStep, toggle, stop } = useTransport({
    bpm,
    steps: total,
    onStep: handleStep,
  });

  /* ---------------- 音频解锁 ---------------- */

  // 事件要铺全：iOS Safari 的用户激活令牌通常在 touchend / click 上发放，
  // pointerdown 不保证算数。unlock 是幂等的，多挂几个没有副作用。
  useEffect(() => {
    const unlock = () => {
      if (engine.isRunning) return;
      void engine
        .start()
        .then(() => {
          engine.setMasterVolume(liveRef.current.volume);
          setAudioReady(engine.isRunning);
        })
        .catch(() => {
          /* 下一次手势会重试 */
        });
    };

    const gestureEvents: string[] = [
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
      'mousedown',
      'click',
      'keydown',
    ];

    for (const type of gestureEvents) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') unlock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      for (const type of gestureEvents) {
        window.removeEventListener(type, unlock, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    engine.setMasterVolume(volume);
  }, [volume]);

  /* ---------------- 键盘快捷键 ---------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  /* ---------------- 实时演奏 ---------------- */

  const heldRef = useRef(new Map<number, () => void>());
  const pendingRef = useRef(new Set<number>());
  const cancelledRef = useRef(new Set<number>());

  const noteOn = useCallback((midi: number) => {
    if (heldRef.current.has(midi) || pendingRef.current.has(midi)) return;

    pendingRef.current.add(midi);
    cancelledRef.current.delete(midi);

    void engine.start().then(() => {
      pendingRef.current.delete(midi);
      if (cancelledRef.current.delete(midi)) return;

      const handle = engine.playNow(liveRef.current.params, midi, 30, 0.9);
      if (handle) heldRef.current.set(midi, handle.release);
    });
  }, []);

  const noteOff = useCallback((midi: number) => {
    if (pendingRef.current.has(midi)) {
      cancelledRef.current.add(midi);
      return;
    }
    const release = heldRef.current.get(midi);
    if (release) {
      release();
      heldRef.current.delete(midi);
    }
  }, []);

  const releaseAllNotes = useCallback(() => {
    for (const midi of pendingRef.current) cancelledRef.current.add(midi);
    for (const release of heldRef.current.values()) release();
    heldRef.current.clear();
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', releaseAllNotes);
    window.addEventListener('pointercancel', releaseAllNotes);
    window.addEventListener('blur', releaseAllNotes);
    return () => {
      window.removeEventListener('pointerup', releaseAllNotes);
      window.removeEventListener('pointercancel', releaseAllNotes);
      window.removeEventListener('blur', releaseAllNotes);
    };
  }, [releaseAllNotes]);

  /* ---------------- 节奏编辑 ---------------- */

  // 小节数变少时裁掉越界音符。
  useEffect(() => {
    setNotes((prev) => clampNotes(prev, bars * STEPS_PER_BAR));
  }, [bars]);

  // 换编辑模式时丢掉未完成的起点。
  useEffect(() => {
    setAnchor(null);
    setHoverStep(null);
  }, [mode]);

  useEffect(() => {
    if (!anchor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAnchor(null);
      setHoverStep(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anchor]);

  const previewRow = useCallback((row: number) => {
    void engine.start().then(() => {
      engine.playNow(liveRef.current.params, ROWS[row], 0.18, 0.9);
    });
  }, []);

  const handleCellDown = useCallback(
    (row: number, step: number) => {
      const hit = findNoteAt(notes, row, step);

      if (mode === 'brush') {
        if (hit) {
          setNotes((prev) => prev.filter((note) => note.id !== hit.id));
          return;
        }
        const length = Math.min(brushLength, maxLengthFor(notes, row, step, total));
        setNotes((prev) => [...prev, { id: nextNoteId(), row, start: step, length }]);
        previewRow(row);
        return;
      }

      // 两次点击：点已有音符 = 删除
      if (hit) {
        setNotes((prev) => prev.filter((note) => note.id !== hit.id));
        setAnchor(null);
        setHoverStep(null);
        return;
      }

      // 第一次点击（或换了行）= 定起点
      if (!anchor || anchor.row !== row) {
        setAnchor({ row, step });
        setHoverStep(step);
        previewRow(row);
        return;
      }

      // 第二次点击 = 定终点
      const from = Math.min(anchor.step, step);
      const to = Math.max(anchor.step, step);

      // 覆盖式绘制：范围内的旧音符让位。
      setNotes((prev) => [
        ...prev.filter(
          (note) => note.row !== row || note.start + note.length <= from || note.start > to,
        ),
        { id: nextNoteId(), row, start: from, length: to - from + 1 },
      ]);
      setAnchor(null);
      setHoverStep(null);
      previewRow(row);
    },
    [anchor, brushLength, mode, notes, previewRow, total],
  );

  const handleCellHover = useCallback(
    (row: number, step: number) => {
      if (!anchor || anchor.row !== row) return;
      // 同一格重复设置同一原始值，React 会直接 bail out。
      setHoverStep(step);
    },
    [anchor],
  );

  const cancelAnchor = useCallback(() => {
    setAnchor(null);
    setHoverStep(null);
  }, []);

  const updateParams = useCallback((patch: Partial<SynthParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleClear = useCallback(() => {
    setNotes([]);
    setAnchor(null);
    setHoverStep(null);
  }, []);

  const handleStopAll = useCallback(() => {
    stop();
    releaseAllNotes();
  }, [stop, releaseAllNotes]);

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>SimpleCompositor</h1>
          <p>纯前端 · Web Audio 合成器</p>
        </div>
        <div className={`engine-status ${audioReady ? 'is-on' : ''}`}>
          <span className="status-dot" />
          <span>{audioReady ? '音频已就绪' : '点击页面任意处启用音频'}</span>
        </div>
      </header>

      <TransportBar
        isPlaying={isPlaying}
        bpm={bpm}
        volume={volume}
        onToggle={isPlaying ? handleStopAll : toggle}
        onBpmChange={setBpm}
        onVolumeChange={setVolume}
        onClear={handleClear}
      />

      <section className="panel sequencer-panel">
        <div className="panel-head">
          <h2 className="panel-title">节奏</h2>

          <div className="panel-tools">
            <div className="tool-group">
              <span className="tool-label">小节</span>
              <Segmented
                label="小节数"
                options={BARS_OPTIONS}
                value={bars}
                onChange={setBars}
              />
            </div>

            <div className="tool-group">
              <span className="tool-label">编辑</span>
              <Segmented
                label="编辑模式"
                options={MODE_OPTIONS}
                value={mode}
                onChange={setMode}
              />
            </div>

            {mode === 'brush' && (
              <div className="tool-group">
                <span className="tool-label">时值</span>
                <Segmented
                  label="新音符时值"
                  options={DURATION_OPTIONS}
                  value={brushBase}
                  onChange={(value) => {
                    setBrushBase(value);
                    if (value < 2) setBrushDotted(false);
                  }}
                />
                <button
                  type="button"
                  className={`dot-btn ${brushDotted && brushBase >= 2 ? 'is-active' : ''}`}
                  disabled={brushBase < 2}
                  title="附点：时值 ×1.5"
                  aria-label="附点"
                  aria-pressed={brushDotted && brushBase >= 2}
                  onClick={() => setBrushDotted((value) => !value)}
                >
                  ·
                </button>
              </div>
            )}

            {anchor && (
              <button type="button" className="ghost-btn is-small" onClick={cancelAnchor}>
                取消起点
              </button>
            )}

            <HelpTip label="节奏编辑说明">
              <p className="help-block">
                <b>两次点击</b>
                点起点，再点终点定长度。点已有音符删除。
              </p>
              <p className="help-block">
                <b>刷子</b>
                先选时值，再点格子放下。
              </p>
              <p className="help-foot">空格键播放 / 停止 · 1 小节 = 16 格</p>
            </HelpTip>
          </div>
        </div>

        <Sequencer
          notes={notes}
          bars={bars}
          anchor={anchor}
          hoverStep={hoverStep}
          currentStep={currentStep}
          onCellDown={handleCellDown}
          onCellHover={handleCellHover}
        />
      </section>

      <div className="columns">
        <SynthPanel params={params} onChange={updateParams} />

        <section className="panel keys-panel">
          <div className="panel-head">
            <h2 className="panel-title">实时演奏</h2>
            <HelpTip label="键盘说明">
              <p className="help-block">按住琴键持续发声，松开即释放。</p>
            </HelpTip>
          </div>
          <PianoKeys baseMidi={60} onNoteOn={noteOn} onNoteOff={noteOff} />
        </section>
      </div>
    </div>
  );
}
