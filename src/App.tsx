import { useCallback, useEffect, useRef, useState } from 'react';

import { engine } from './audio/engine';
import { DEFAULT_SYNTH, type SynthParams } from './audio/voice';
import { PianoKeys } from './components/PianoKeys';
import { StepGrid } from './components/StepGrid';
import { SynthPanel } from './components/SynthPanel';
import { TransportBar } from './components/TransportBar';
import { useTransport } from './hooks/useTransport';

/** 网格的行：从高到低。C 大调五声音阶，随手点都不容易难听。 */
const ROWS = [72, 69, 67, 64, 62, 60, 57, 55];
const STEPS = 16;

/** 初始演示节奏（x = 触发）。 */
const SEED = [
  '........x.......',
  '................',
  '....x......x....',
  '..x...x...x...x.',
  '..............x.',
  'x.......x.......',
  '................',
  '................',
];

function createSeedPattern(): boolean[][] {
  return SEED.map((row) => Array.from({ length: STEPS }, (_, step) => row[step] === 'x'));
}

function createEmptyPattern(): boolean[][] {
  return ROWS.map(() => Array.from({ length: STEPS }, () => false));
}

export default function App() {
  const [pattern, setPattern] = useState<boolean[][]>(createSeedPattern);
  const [params, setParams] = useState<SynthParams>(DEFAULT_SYNTH);
  const [bpm, setBpm] = useState(112);
  const [volume, setVolume] = useState(0.75);
  const [audioReady, setAudioReady] = useState(false);

  // 调度回调在 React 之外执行，必须通过 ref 读到最新参数，
  // 否则它会一直用首次渲染时的闭包值。
  const liveRef = useRef({ pattern, params, bpm, volume });
  useEffect(() => {
    liveRef.current = { pattern, params, bpm, volume };
  });

  /** 每一步：把该行该列的所有音符排进音频时钟。 */
  const handleStep = useCallback((step: number, time: number) => {
    const current = liveRef.current;
    const stepDuration = 60 / current.bpm / 4;

    for (let row = 0; row < ROWS.length; row++) {
      if (current.pattern[row]?.[step]) {
        engine.playAt(current.params, ROWS[row], time, stepDuration * 0.9, 0.9);
      }
    }
  }, []);

  const { isPlaying, currentStep, toggle, stop } = useTransport({
    bpm,
    steps: STEPS,
    onStep: handleStep,
  });

  // 浏览器的自动播放策略要求：必须在用户手势里创建/恢复 AudioContext。
  useEffect(() => {
    const unlock = () => {
      if (engine.isRunning) return;
      void engine
        .start()
        .then(() => {
          engine.setMasterVolume(liveRef.current.volume);
          setAudioReady(true);
        })
        .catch(() => {
          /* 忽略：下一次手势会重试 */
        });
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    engine.setMasterVolume(volume);
  }, [volume]);

  // 空格键播放 / 停止。
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

  // 实时演奏：按住发声，松开释放。
  // pending 记录"等待引擎启动"的音，cancelled 记录在等待期间就被松开的音，
  // 否则快速点一下会在启动完成后留下一个没人释放的长音。
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

      // 30 秒是个"足够长"的名义时长，实际由松键时的 release 收尾。
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

  // 指针在琴键外抬起、窗口失焦时，兜底释放所有音，避免卡住长音。
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

  const toggleCell = useCallback(
    (row: number, step: number) => {
      const turningOn = !pattern[row][step];

      setPattern((prev) =>
        prev.map((line, rowIndex) =>
          rowIndex === row
            ? line.map((on, stepIndex) => (stepIndex === step ? !on : on))
            : line,
        ),
      );

      // 点亮格子时试听一下，调音色时不用一直按播放。
      if (turningOn) {
        void engine.start().then(() => {
          engine.playNow(params, ROWS[row], 0.22, 0.9);
        });
      }
    },
    [pattern, params],
  );

  const updateParams = useCallback((patch: Partial<SynthParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleClear = useCallback(() => {
    setPattern(createEmptyPattern());
  }, []);

  const handleStopAll = useCallback(() => {
    stop();
    releaseAllNotes();
  }, [stop, releaseAllNotes]);

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
          <p className="panel-note">每格 = 十六分音符 · 空格键播放/停止</p>
        </div>
        <StepGrid
          rows={ROWS}
          pattern={pattern}
          currentStep={currentStep}
          onToggle={toggleCell}
        />
      </section>

      <div className="columns">
        <SynthPanel params={params} onChange={updateParams} />

        <section className="panel keys-panel">
          <div className="panel-head">
            <h2 className="panel-title">实时演奏</h2>
            <p className="panel-note">按住持续发声，松开释放</p>
          </div>
          <PianoKeys baseMidi={60} onNoteOn={noteOn} onNoteOff={noteOff} />
        </section>
      </div>

      <footer className="footer">
        <span>
          四种波形 · 每音两个失谐振荡器 · ADSR 包络 · 低通滤波 · 主总线压缩
        </span>
        <span className="footer-tip">音序器按音频时钟排期，UI 掉帧不影响节奏</span>
      </footer>
    </div>
  );
}
