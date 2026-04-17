# PerSpatia: Ad Lumina - 架构决策矩阵 (Architecture Matrix)

*最后更新时间：当前会话*

## 核心目标
在两周内开发出 **Ad Lumina** 分支。该分支旨在提供一个基于节点（Node-based）的 Web 原生空间编程环境，允许用户实时编写并预览 React / React Three Fiber / WebGPU 相关的数学与视觉特效代码。

## 核心挑战
在带有 3D 透视（Perspective）和无限缩放（Zoom/Pan）的 Web 画布中：
1. 如何保证代码编辑器的文本始终绝对锐利（抗 CSS 缩放模糊）。
2. 如何保证中文输入法（IME）在复杂的 3D CSS Transform 下定位准确。
3. 如何高性能地实时预览用户的 3D R3F 产物代码，且不拖垮主线程帧率。

---

## 决策轴 1：Code Editor UI（文本编辑器层）

负责用户输入与交互，必须解决清晰度与 IME 问题。

### 选项 1A: 纯 Web 原生 (React + CSS 3D + CodeMirror 6)
* **架构**：在 ReactFlow / 3D Canvas 内部直接挂载 DOM，通过 `translate` 或 `perspective` 实现缩放。内部嵌入 CM6。
* **优点**：技术栈统一，无缝接入生态。
* **缺点/风险**：
  * **合成层模糊 (Composite Layer Rasterization)**：这是 CSS 3D 最大的顽疾。当元素涉及复杂的 Transform（特别是包含 `overflow: auto` 或被提升为独立 GPU 合成层时），浏览器为了性能，会为该层拍摄一张基于初始尺寸的“位图快照（Texture）”。后续的 Zoom 放大实际上只是在生硬地拉伸这张低分辨率的图片，导致文字严重发虚。亚像素对齐（Sub-pixel Alignment）问题仅仅是加剧了这一现象。
  * **IME 飞线**：CM6 等编辑器强依赖 `getBoundingClientRect` 进行绝对定位，祖先节点的 3D 变换会导致输入法候选框位置严重跑偏。

### 选项 1B: Flutter 降维打击 (React Host + Flutter Web Iframe)
* **架构**：外层保留 React 用于调度和 Babel/SWC 编译。将节点编辑 UI 扔进一个包含 Flutter Web 的 Iframe 中。
* **优点**：
  * **绝对锐利**：Flutter 的 Skia / CanvasKit 引擎直接接管渲染，所有文本和抗锯齿在 GPU 层面重新计算，彻底无视 DOM 缩放模糊。
  * 编译工作留在原生的 V8 / 外部 React 环境，避免了 Dart 编译 JS 的生态隔离噩梦。
* **缺点/风险**：跨环境通信（`postMessage` 等）的延迟可能导致 UI 与底层 3D 场景的滑动轻微脱节（但在无参考物的黑盒场景下可容忍）。

### 选项 1C: 面板抽离 (Inspector Paradigm - 功能降级)
* **架构**：3D 节点只保留极简的输入/输出接口，不展示代码。点击节点时，在屏幕侧边栏（固定 2D 面板，无任何 transform）展开完整的 CM6 编辑器。
* **优点**：瞬间解决所有渲染和 IME 痛点，实现成本极低。
* **缺点**：不符合最初“在空间原位编程”的产品形态。

---

## 决策轴 2：Artifact Preview Node (R3F 产物预览层)

负责将用户编写的 R3F/WebGPU 字符串代码实时渲染展示。

### 选项 2X: Iframe + 阶梯式 LOD (Scale-then-Rasterize)
* **架构**：用户代码被编译成独立的 Web 页面放入 Iframe。
* **交互策略**：
  * **Zooming 期间**：使用 CSS `transform: scale()` 放大 Iframe（此时 GPU 仅拉伸位图，保证 60fps 帧率，视觉变模糊）。
  * **Idle 期间**：当缩放停止（Debounced），动态修改 Iframe 的 DOM `width/height` 至当前视口所需的高清分辨率，并将 `scale` 置回 1。触发内部 R3F Canvas 重绘。
* **优点**：技术最成熟，沙盒隔离最安全。
* **缺点**：1500px 以上的 Iframe 重排和 Canvas Resize 开销极大，易造成卡顿。

### 选项 2Y: `<RenderTexture>` 同源渲染 (The "Magic" Solution)
* **架构**：将用户字符串用 Babel/SWC 编译为 React Component 后，直接注入主 R3F 场景的 `@react-three/drei` `<RenderTexture>` 容器中。
* **交互策略**：
  * `<RenderTexture>` 本质是一个 WebGL FBO（帧缓冲对象）。用户的 3D 场景被渲染成一张贴图，贴在 3D 节点的面上。
  * 根据相机距离动态调整 FBO 的 `resolution`（相当于图形学层面的 LOD）。
* **优点**：
  * **性能绝杀**：零 Iframe 损耗，同源 WebGL 上下文，无跨域问题。
  * **视觉融合**：这层纹理可以接受主场景的光照，甚至叠加 WebGPU 体积光后期特效，完美契合 Math Sci-Fi 设定。
* **缺点**：沙盒隔离性差，用户编写的死循环或内存泄漏代码会直接导致主应用崩溃。

---

## 执行计划（Timeline & Path）

**阶段一：Demo 冲刺 (Day 1 - 2)**
* **策略**：**视觉优先，容忍模糊**。
* **目标**：在 `v1-math-scifi` 变体中，基于现有的 DOM 架构（接受一定的亚像素模糊），完善理科科幻视觉（发光背景、全息节点等），跑通基本的连线与代码执行链路，以供近期功能展示。

**阶段二：核心突围**
* **策略**：尝试 **1A (CM6)**。如果卡在 CSS 模糊与 IME 问题上耗时过长，立即熔断，转向 **1B (Flutter Iframe)**。如果性能不达标，最后退守 **1C (Inspector 侧边栏)**。
* 对于预览层，优先尝试 **2Y (RenderTexture)** 的同源渲染，追求极致性能与融合感。
