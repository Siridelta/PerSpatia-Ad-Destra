# 移动端适配笔记 (Mobile Adaptation Notes)

为了让 PerSpatia 在移动端也能进行预览和基础交互，我们需要记录并处理一些移动端特有的适配问题。

## 1. 路由与全屏布局冲突
- **问题**：`#root` 和 `.app-container` 默认设置为 `100vh` 且 `overflow: hidden`，这是为了防止画布页面（v0, v1）在移动端出现原生滚动和皮筋效应（Rubber-banding）。但这导致了普通的流式页面（如 `/` 路由下的 `VariantsIndex`）内容超出屏幕时被直接截断，无法滚动。
- **解决**：在非画布页面（如 `VariantsIndex`）的根容器上设置 `height: 100vh; overflow-y: auto; box-sizing: border-box;`，使其内部可滚动，从而绕过全局的 `overflow: hidden` 限制。

## 2. CSS 3D 与移动端渲染（已知风险）
- **问题**：v1-math-scifi 尝试使用 DOM + CSS 3D Transform 来渲染节点。在移动端浏览器中，复杂的 3D 变换叠加可能会导致比桌面端更严重的字体模糊、性能下降甚至渲染闪烁。
- **后续关注点**：如果 DOM + CSS 3D 在移动端的表现过于糟糕，这会进一步推动我们将节点 UI 迁移到基于 Skia 的 Flutter Web Iframe 方案（Plan 1B）。

## 3. 交互手势冲突（待处理）
- **问题**：画布的拖拽平移（Pan）、双指缩放（Pinch-to-zoom）可能会与移动端浏览器的原生手势（如边缘滑动返回、下拉刷新）产生冲突。
- **计划**：需要确保在 Canvas 容器上阻止默认的原生触摸事件（`touch-action: none`），并将所有的 Touch 事件正确映射到 R3F / React Flow 的交互逻辑中。

*(随着开发深入，继续在此补充)*
