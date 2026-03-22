# 方案三：Playwright 内置录屏

**状态**：✅ 稳定可用  
**适用场景**：快速录制演示视频  
**缺点**：会打开新窗口

---

## 简介

使用 Playwright 的 `recordVideo` 功能录制浏览器操作。

---

## 文件位置

```
scripts/
├── core/
│   └── screencaster.cjs      # 核心模块
├── examples/
│   ├── record-zoom-test.cjs  # 缩放示例
│   └── record-pan-test.cjs   # 拖拽示例
└── templates/
    └── record-template.cjs   # 任务模板
```

---

## 使用方法

### 1. 启动浏览器远程调试

```powershell
# Chrome
chrome.exe --remote-debugging-port=9222

# Edge
msedge.exe --remote-debugging-port=9222
```

### 2. 运行示例

```powershell
cd my-skills/screencast-debugging
node examples/record-zoom-test.cjs
```

---

## API 文档

### `record(options)`

```javascript
const { record, zoom, pan, clickElement } = require('./core/screencaster.cjs');

await record({
  outputDir: '../../assets',              // 视频输出目录
  filename: 'test.mp4',                   // 视频文件名
  url: 'http://localhost:5173',          // 录制页面
  viewport: { width: 1920, height: 1080 }, // 分辨率
  preDelay: 3000,                         // 页面加载后等待(ms)
  postDelay: 1000,                        // 操作完成后等待(ms)
  action: async (page) => {
    // 在这里写操作逻辑
    await zoom(page, 5, -100, 500);
  }
});
```

### 工具函数

| 函数 | 参数 | 用途 |
|------|------|------|
| `zoom(page, steps, deltaY, delay)` | 步数, 滚动量, 间隔 | 滚轮缩放 |
| `pan(page, deltaX, deltaY, duration)` | X位移, Y位移, 持续时间 | 拖拽平移 |
| `clickElement(page, selector, delay)` | CSS选择器, 延迟 | 点击元素 |

---

## 创建新任务

```powershell
# 复制模板
cp templates/record-template.cjs examples/my-test.cjs

# 编辑 examples/my-test.cjs
# 运行
node examples/my-test.cjs
```

---

## 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 稳定可靠 | ❌ 会打开新窗口 |
| ✅ 模块化设计 | ❌ 视频质量中等 |
| ✅ 完整 Playwright API | ❌ 录的是新窗口，不是主窗口 |
| ✅ 不依赖额外软件 | |

---

## 适用场景

- 快速录制演示视频
- 自动化测试录屏
- 不需要最高画质的情况

---

[← 返回总览](./recording-solutions.md)
