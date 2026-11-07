# AGENTS.md

给在本仓库工作的 agent 的约定。面向使用者的说明在 [README.md](README.md)。

## 开发服务器

`npm run dev` 必须对局域网开放，方便用手机真机验证：

```ts
// vite.config.ts
server: { host: true, port: 5173, strictPort: true }
```

启动后把 **Network** 地址（形如 `http://192.168.x.x:5173/`）报给用户，并提醒手机需与电脑在同一 Wi-Fi。
不要只绑 `127.0.0.1`。

## 验证音频改动

改音频链路后至少跑：

1. `npm run build`（含 `tsc --noEmit`）
2. 打开 `/dev/verify.html`，确认各波形峰值正常、首尾采样为 0、调度器间隔等于 `60 / bpm / 4`
3. 涉及手势解锁 / 自动播放策略的改动，用真机 iOS Safari 验证 —— headless 浏览器会合成
   pointer 事件，无法复现 iOS 的激活令牌规则

## 文档边界

- README 只写项目本身：是什么、怎么跑、功能、结构、路线
- 给 agent 的提醒、约定、验证流程写在本文件
- 实现细节的"为什么"写在代码注释里，不在 README 重复

## 部署

`vite.config.ts` 已设置 `base: './'`，产物使用相对路径，可以直接部署到子目录
（如 GitHub Pages 的 `/repo/`）。改动构建配置时不要把它删掉。

## 代码约定

- 音频节点树与 React 渲染树解耦；React 只负责 UI 状态
- 不引入音频库，除非确认现有 Web Audio 实现无法满足
- 注释说明"为什么"，不复述"做了什么"
