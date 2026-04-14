# Ad Lumina 技术实现规范 (Tech Specs)

记录在开发 Ad Lumina 分支过程中沉淀的、实实在在的技术方案与实现细节。

## 1. 空间交互模型 (Camera & Touch)

### 1.1 多点触控追踪
- **核心字典**：使用 `activePointers (Map<id, data>)` 实时追踪屏幕触点。
- **重心映射**：
  - 单指 -> 平移 (Pan)。
  - 双指 -> 平移 (重心移动) + 缩放 (距离变化)。
  - 三指 -> 旋转 (Orbit)。
- **平滑切换**：每次触点数量变化时，必须调用 `resetPointersBase` 重新结算基准点，防止画面跳变。

### 1.2 捕获阶段拦截 (Capture Phase Takeover)
- **机制**：在 `CameraControl` 顶层容器使用 `onPointerDownCapture`。
- **逻辑**：
  - 若为单指点在节点上，放行给 React Flow。
  - 若屏幕出现 >= 2 根手指，立刻 `stopPropagation` 掐断事件下发，由相机强制接管。
- **指针捕获**：必须调用 `setPointerCapture` 以确保手指滑出视口后仍能正确触发 `pointerup` 结算状态。

## 2. 视觉与字体系统 (Aesthetics & Fonts)

### 2.1 可变字体驱动
- **方案**：使用 `CSS Variables` 控制可变字体的轴参数。
- **核心变量**：
  - `--spatial-font-family`: 默认 Cascadia Code Variable。
  - `--spatial-font-weight`: 范围 100-800。
- **强制属性**：必须在 CSS 中显式声明 `font-variation-settings: "wght" var(--spatial-font-weight)` 才能确保字重调节对 Web 字体生效。

### 2.2 节点视觉规范 (The Floating Node)
- **去实体化**：节点根容器禁用 `background`, `border`, `box-shadow`。
- **调节边界**：`NodeResizeControl` 保持透明且覆盖全高度，视觉引导由内部的 `node-decor-line`（发光细线）承担。

## 3. 路由方案 (Routing)
- **HashRouter**：全面采用 Hash 路由以适配 `live-server` 等静态托管环境，确保移动端刷新不丢失路径。
