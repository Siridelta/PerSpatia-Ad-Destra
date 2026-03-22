# 录屏方案四：OBS WebSocket 自动化（推荐）

**状态**：✅ 已实现

**原理**：OBS 录制主屏幕/窗口（高质量硬件编码），Playwright 连接已有浏览器，只负责操作（不录屏）

## 文件位置

```
r3f-reactflow-nextui/scripts/
├── core/
│   ├── obs-screencaster.cjs   # 一体化录屏（推荐）
│   └── obs-controller.cjs     # 底层控制
├── examples/
│   ├── record-obs-zoom.cjs      # 简化示例
│   └── record-obs-advanced.cjs  # 高级示例
└── templates/
    └── obs-record-template.cjs  # 任务模板
```

## 前置设置

### 1. OBS 启用 WebSocket

- 工具 → WebSocket 服务器设置
- 启用服务器，端口 4455，密码留空（或设置密码）

### 2. 配置录制场景

- 来源 → 添加「显示捕获」或「窗口捕获」
- 调整区域覆盖你要录制的浏览器窗口

### 3. 浏览器远程调试（可选）

- Edge: `msedge.exe --remote-debugging-port=9222`
- Chrome: `chrome.exe --remote-debugging-port=9222`

## 使用方法

```powershell
cd r3f-reactflow-nextui
node scripts/examples/record-obs-zoom.cjs
```

## 新版简化 API（推荐）

使用 `obs-screencaster.cjs`，只需关注操作逻辑，OBS 和浏览器自动管理：

```javascript
const { record, zoom, pan, click } = require('./core/obs-screencaster.cjs');

await record({
  // OBS 配置
  obsAddress: 'ws://localhost:4455',
  obsPassword: '',

  // 浏览器配置
  cdpUrl: 'http://localhost:9222',
  url: 'http://localhost:5173',
  useExistingPage: true,  // 使用已有页面，不打开新窗口

  // 录制参数
  preDelay: 3000,
  postDelay: 1000,

  // 核心操作：只需操作 page，OBS 自动录制
  action: async (page) => {
    await zoom(page, 5, -100, 500);  // 放大
    await pan(page, 200, 0, 1000);   // 拖拽
    await click(page, '#my-button'); // 点击
  }
});
```

## 便捷工具函数

| 函数 | 参数 | 用途 |
|------|------|------|
| `zoom(page, steps, deltaY, delay)` | 步数, 滚动量, 间隔 | 滚轮缩放 |
| `pan(page, deltaX, deltaY, duration)` | X位移, Y位移, 持续时间 | 拖拽平移 |
| `click(page, selector, delay)` | CSS选择器, 延迟 | 点击元素 |

## 底层控制 API（可选）

如需更精细控制（切换场景、暂停等）：

```javascript
const { OBSController } = require('./core/obs-controller.cjs');

const obs = new OBSController({ address: 'ws://localhost:4455' });
await obs.connect();
await obs.startRecording();
await obs.pauseRecording();   // 暂停
await obs.resumeRecording();  // 恢复
await obs.stopRecording();
await obs.disconnect();
```

### OBS 控制模块 API

| 方法 | 用途 |
|------|------|
| `obs.connect()` | 连接 OBS |
| `obs.startRecording()` | 开始录制 |
| `obs.stopRecording()` | 停止录制 |
| `obs.pauseRecording()` | 暂停录制 |
| `obs.resumeRecording()` | 恢复录制 |
| `obs.getRecordingStatus()` | 获取状态 |
| `obs.setScene(name)` | 切换场景 |
| `obs.getSceneList()` | 获取场景列表 |
| `obs.getRecordDirectory()` | 获取录制目录 |

## 创建新任务

```powershell
cd r3f-reactflow-nextui/scripts
cp templates/obs-record-template.cjs examples/my-test.cjs
# 编辑 examples/my-test.cjs，修改 action 函数
node examples/my-test.cjs
```

## 优点

- ✅ 录主窗口（不是新窗口！）
- ✅ 高质量视频（NVENC/QuickSync 硬件编码）
- ✅ 可录制全屏交互效果
- ✅ OBS 功能强大（多场景、滤镜等）

## 缺点

- ❌ 需要额外运行 OBS
- ❌ 需要配置录制区域
- ❌ 需要浏览器远程调试

## API 对比

| 需求 | 推荐模块 | 复杂度 |
|------|----------|--------|
| 简单录制，操作页面 | `obs-screencaster.cjs` | 低（只需 action） |
| 需要切换 OBS 场景 | `obs-controller.cjs` | 中（手动管理） |
| 暂停/恢复录制 | `obs-controller.cjs` | 中（手动管理） |
