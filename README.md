# SimpleCompositor

一个纯前端的浏览器合成器：16 步节奏网格 + 四种基本波形 + 实时演奏键盘。
零音频依赖，全部基于浏览器原生 Web Audio API。

![界面预览](docs/preview.png)

## 运行

```bash
npm install
npm run dev        # http://localhost:5173
```

生产构建：

```bash
npm run build      # 先 tsc 类型检查，再 vite build
npm run preview
```

## 已实现

- **波形**：正弦 / 三角 / 锯齿 / 方波
- **节奏**：16 步十六分音符音序器，BPM 50–200，循环播放
- **音色**：每个音 2 个 ±7 音分失谐振荡器叠加 + ADSR 包络 + 低通滤波（截止频率 / 共振 Q）
- **复音**：主总线挂压缩器，多声部叠加不削顶
- **实时演奏**：C4–C5 键盘，按住持续发声，松开释放
- **快捷键**：空格键播放 / 停止

## 架构

音频全部跑在 React 之外：

| 文件 | 职责 |
| --- | --- |
| [`src/audio/engine.ts`](src/audio/engine.ts) | AudioContext 单例 + 主总线（压缩器 → 总音量） |
| [`src/audio/voice.ts`](src/audio/voice.ts) | 单音构建：振荡器 → 滤波 → ADSR |
| [`src/audio/scheduler.ts`](src/audio/scheduler.ts) | lookahead 步进调度器 |
| [`src/hooks/useTransport.ts`](src/hooks/useTransport.ts) | 把调度器接到 React，只管 UI 高亮 |
| [`src/components/`](src/components) | 纯展示组件 |

核心设计：定时器只负责**提前预约**未来的音符时间点，真正的发声时刻由音频时钟决定。
所以 UI 掉帧、React 重渲染都不会影响节奏；加效果器、加轨道也不会因为 state 变化而卡顿。

## 两个容易踩的坑（已处理）

1. **咔哒声** —— 成因全是波形不连续。包络只用指数斜坡、端点严格递增；松键时先
   `cancelScheduledValues` 再锚定当前值；`exponentialRamp` 不能碰 0，用 1e-4 兜底。
2. **自动播放策略** —— 浏览器在用户手势之前不让出声。这里同时监听
   `pointerdown` / `pointerup` / `touchstart` / `touchend` / `mousedown` / `click` / `keydown`，
   而不是只挂 `pointerdown`：iOS Safari 的用户激活令牌通常在 `touchend` 或 `click`
   上发放，只挂 pointerdown 会出现"桌面正常、手机没声音"。
   首次解锁时还会播一个 1 帧静音 buffer（iOS 的音频会话解锁条件），并对 iOS 16.4+
   声明 `navigator.audioSession.type = 'playback'`，避免侧边静音拨片把网页音频静音。

另外，音符比 attack+decay 还短时会把 A/D 压进音符长度，否则长起音配短音符几乎听不见。

## 自检

```bash
npm run dev
# 然后打开 http://localhost:5173/dev/verify.html
```

页面会用 `OfflineAudioContext` 离线渲染各波形，输出峰值、首尾采样、最大相邻采样差，
用来确认没有静音、没有咔哒声，并验证调度器间隔是否精确等于 `60 / bpm / 4`。

## 下一步可以加

- 钢琴音色（挂采样，`smplr` 最省事）
- 混响 / 延迟效果器
- 步数切换（8 / 16 / 32）、多小节、swing
- Web MIDI 外接键盘
- 频谱可视化（`AnalyserNode`）
- 导出 WAV（`OfflineAudioContext` 离线渲染，比实时录音快）
