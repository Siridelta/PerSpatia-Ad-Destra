# 相机架构系统设计 (Camera Architecture)

本文档描述了 PerSpatia 中如何通过一套统一的虚拟相机系统，将 2D React Flow 画布与 3D R3F 场景整合在同一视觉空间内的工程实现。

## 1. 核心设计哲学 (Core Philosophy)

### 1.1 升维整合 (Dimensional Integration)
我们将 React Flow 画布视为 3D 世界中立在 **XY 平面 (Z=0)** 的一面竖直墙面。
*   **2D 逻辑**：React Flow 节点依然运行在 2D 坐标系中。
*   **3D 呈现**：通过给外层容器施加 **CSS 3D Transform**（Perspective + Rotation），并同步驱动底层的 **Three.js PerspectiveCamera**，实现视觉上的深度感。
*   **游戏级交互 (Game-like UX)**：采用 WASD 平移和右键轨道旋转，交互逻辑向 3D 引擎看齐，而非传统的 2D 图形编辑器。

### 1.2 唯一事实源 (SSOT)
整个系统的真相（Truth）存储在 `CameraControl` 的 Zustand Store 中。
*   **单向同步**：相机 Store -> 派生出 React Flow Viewport。
*   **禁止反写**：严禁通过 React Flow 的 `onMoveEnd` 回调反向修改相机状态，以防旋转角度 (Theta/Phi) 丢失。

---

## 2. 状态结构与坐标系

### 2.1 坐标约定
遵循右手系，与 Three.js 对齐：
*   **X 轴**：沿墙面水平向右。
*   **Y 轴**：沿墙面垂直向上。
*   **Z 轴**：纵深方向，相机位于 Z+ 侧正视原点。

### 2.2 相机状态 (CameraState)
```typescript
interface CameraState {
  orbitCenterX: number; // 轨道中心点 X (墙面平移)
  orbitCenterY: number; // 轨道中心点 Y (墙面平移)
  radius: number;       // 相机到中心点的距离 (对应 2D Zoom)
  theta: number;        // 方位角 (Azimuthal Angle)
  phi: number;          // 极角 (Polar Angle)
}
```

---

## 3. 物理系统与信道 (Physics Channels)

物理逻辑在每一帧的 `tick()` 中处理，分为三个独立信道：

### 3.1 偏移追踪信道 (Offset Tracker)
用于鼠标拖拽。采用**增量驱动模型**：
*   鼠标位移叠加至 `target` -> `current` 追踪 `target` -> 计算本帧增量 `Delta` -> 累加至 `Base` 角度。
*   **优点**：彻底规避了 Clamp 边界处的控制死区。

### 3.2 速度信道 (Velocity Channel)
用于 WASD 键盘操作。产生持续的速度分量，具有物理阻尼感。

### 3.3 漂移信道 (Drift Channel)
由平移速度自动感应产生的微小偏航（Yaw）。
*   **公式**：`drift = velocity * biasStrength / radius`。
*   **特性**：Drift 仅作为视觉叠加，不参与核心角度的 Clamp 限制。

---

## 4. 约束与边界 (Constraints)

### 4.1 20 度锥体限制
手动旋转产生的 `BaseTheta/Phi` 被限制在相对于正视中心点的 **20 度 (0.349 rad)** 圆形区域内。
*   **碰撞物理**：若在惯性旋转中触碰边界，执行**速度投影（Sliding Physics）**，使相机沿圆周边缘平滑滑动而非生硬停止。

### 4.2 缩放联动
`radius` 与 React Flow 的 `zoom` 存在映射关系：`zoom = 30 / radius`。

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
