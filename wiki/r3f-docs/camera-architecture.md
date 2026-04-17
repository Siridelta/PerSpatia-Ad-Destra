# 相机系统：从愿景到架构实现 (Camera: From Vision to Implementation)

本文档记录了 PerSpatia 虚拟相机系统的完整演进：从最初的交互愿景，到关键的技术应对措施，再到最终稳定的架构实现。它不仅是工程规范，更是设计意图的沉淀。

## 1. 核心设计哲学 (Core Philosophy)

### 1.1 交互范式：游戏化体验 (Game-like UX)
PerSpatia 致力于打破“生产力工具”与“3D 游戏”的壁垒：
*   **WASD 优先**：平移被视为最高优先级。不仅是 2D 画布移动，更是相机在 3D 墙面上的“扫掠”。
*   **轨道旋转 (Orbit)**：通过右键驱动，提供具有阻尼感的视角倾斜，增强空间深度感。
*   **物理反馈**：所有交互均带阻尼、惯性和碰撞投影，消除生硬的数位感。

### 1.2 增量累加器 (Delta Accumulator / Integrator)
这是相机控制系统的核心数学模型：
*   **技巧内核**：不使用绝对坐标直接控制相机，而是通过“增量（Delta）”在多个物理信道之间进行叠加积分。
*   **优势**：天然支持多源输入（鼠标、键盘、惯性、漂移）的无冲突叠加。由于每一帧只累加“变了多少”，系统可以非常容易地在最终合成前插入各种暂态偏移。
*   **心智模型**：相机状态是一个对多个独立增量源进行实时积分的累加器。

### 1.3 升维整合 (Dimensional Integration)
我们将 React Flow 画布视为 3D 世界中立在 **XY 平面 (Z=0)** 的一面竖直墙面。
*   **2D 逻辑**：React Flow 节点依然运行在 2D 坐标系中。
*   **3D 呈现**：通过给外层容器施加 **CSS 3D Transform** 实现视觉深度。

### 1.4 唯一事实源 (SSOT)
整个系统的真相存储在 `CameraControl` 的 Zustand Store 中。使用的 Zustand Store 为同步库，所以可以绕过 React 原生状态同步路线，来高效地响应和通知状态更新。
*   **单向同步**：相机 Store -> 派生出 React Flow Viewport。严禁反向修改，以防旋转角度丢失。

---

## 2. 状态结构与坐标系 (State & Coordinates)

### 2.1 坐标约定
遵循右手系，与 Three.js 对齐：
*   **X 轴**：沿墙面水平向右。
*   **Y 轴**：沿墙面垂直向上。
*   **Z 轴**：纵深方向，相机位于 Z+ 侧正视原点。

### 2.2 相机对外状态 (CameraState)
```typescript
interface CameraState {
  orbitCenterX: number; // 轨道中心点 X (墙面平移)
  orbitCenterY: number; // 轨道中心点 Y (墙面平移)
  radius: number;       // 相机到中心点的距离
  theta: number;        // 方位角 (Azimuthal Angle)
  phi: number;          // 极角 (Polar Angle)
}
```

---

## 3. 物理系统与信道 (Physics Channels)

物理逻辑在每一帧的 `tick()` 中处理，分为三个独立信道：

### 3.1 偏移追踪信道 (Offset Tracker)
用于鼠标/触控拖拽。采用**增量驱动模型**：
*   位移叠加至 `target` -> `current` 追踪 `target` -> 计算本帧增量 `Delta` -> 累加至 `Base` 角度。
*   **优点**：彻底规避了 Clamp 边界处的控制死区。

### 3.2 触控追踪与拦截 (Touch & Capture)
*   **多点触控追踪**：使用 `activePointers (Map<id, data>)` 实时追踪触点。
    *   **单指** -> 平移 (Pan)。
    *   **双指** -> 平移 (重心移动) + 缩放 (距离变化)。
    *   **三指** -> 旋转 (Orbit)。
*   **平滑切换**：每次触点数量变化时，必须调用 `resetPointersBase` 重新结算基准点，防止画面跳变。
*   **捕获阶段拦截 (Capture Phase Takeover)**：
    *   在 `CameraControl` 顶层容器使用 `onPointerDownCapture`。
    *   若为单指点击节点，放行给 React Flow；若出现 >= 2 根手指，立刻 `stopPropagation` 掐断事件下发，由相机强制接管。
*   **指针捕获 (Pointer Capture)**：必须调用 `setPointerCapture` 以确保手指滑出视口后仍能正确触发 `pointerup` 结算状态。

### 3.3 速度信道 (Velocity Channel)
用于 WASD 键盘操作。产生持续的速度分量，具有物理阻尼感。

### 3.4 漂移信道 (Drift Channel)
由平移速度自动感应产生的微小偏航（Yaw）。
*   **公式**：`drift = velocity * biasStrength / radius`。
*   **特性**：Drift 仅作为视觉叠加，不参与核心角度的 Clamp 限制。

### 3.5 指数缩放系统 (Exponential Zoom System)
*   **对数空间驱动**：`radius` 的变化运行在对数空间 (Logarithmic Space)。公式：`radius = exp(logValue)`。
*   **缩放联动**：`radius` 与 React Flow 的 `zoom` 存在映射关系：`zoom = 30 / radius`。
*   **理由**：保证在任何缩放尺度下（极近或极远），同等强度的滚轮操作产生的“视觉缩放比例”是恒定的，消除线性缩放带来的突兀感。

---

## 4. 约束与边界 (Constraints)

### 4.1 20 度锥体限制
手动旋转产生的 `BaseTheta/Phi` 被限制在相对于正视中心点的 **20 度 (0.349 rad)** 圆形区域内。
*   **碰撞物理**：若在惯性旋转中触碰边界，执行**速度投影（Sliding Physics）**，使相机沿圆周边缘平滑滑动而非生硬停止。
*   **抗饱和 (Anti-Windup)**：这是实现“撞墙即响应”的关键。当 Base 角度撞击 20 度边界时，系统会同步重置（Sync）累加器的 Target 为当前位置。这消除了控制量在边界外的无效堆积，确保用户只要反向划动 1 像素，相机就能立刻从边缘回弹。

---

## 5. 数据流向 (Data Flow)

1.  **输入层**：`CameraControl` 捕获 DOM 冒泡事件（Pointer/Wheel）或全局 Keydown，写入 Store 的 `input` 区域。
2.  **物理层**：`Scene3D` 的 `useFrame` 调用 `tick()`，执行积分、阻尼、Clamp 计算，更新 `cameraState`。
3.  **呈现层** (三路并发消费)：
    *   **Three.js**：每帧同步 `PerspectiveCamera` 的 position 和 lookAt。
    *   **CSS 3D**：通过 `subscribe` 修改 DOM 的 transform。
    *   **React Flow**：通过 `ReactFlowViewportSync` 同步更新 2D 视口。

---

## 6. 排错指南 (Troubleshooting)

*   **平移跳变**：检查是否错误地缓存了旧相机坐标系的投影点。应采用“单点+当帧双射线”方案。
*   **旋转失效**：确认是否有其他组件通过 `setViewport` 意外覆盖了相机 Store。
*   **3D 不对齐**：检查 `SCREEN_METRIC_TO_THREE` 常量是否被修改。
