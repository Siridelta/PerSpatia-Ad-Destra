# 跨层级相机同步架构设计 (Cross-Layer Camera Sync Architecture)

## 核心目标
将 DOM 事件、Three.js (R3F) 3D 渲染和 React Flow 2.5D 节点视图进行高性能同步，彻底绕过 React 的渲染生命周期，避免因高频更新导致掉帧。

## 架构选型：Zustand 瞬态更新 (Transient Updates) + DOM 订阅
由于我们需要在 `useFrame` (Three.js 的 requestAnimationFrame 循环) 中读取和写入状态，并且不能触发 React 组件的重新渲染，Zustand 的 `getState()` 和 `subscribe()` 是最完美的解决方案。

### 1. 状态中心：`useCameraStore`
- 存储相机的物理状态（`targetX`, `targetY`, `radius`, `theta`, `phi`）。
- 存储输入状态（`isPanning`, `isRotating`, `keys`, `lastPointer`）。
- 存储物理系统的内部变量（`panOffset`, `panVelocity`, 等）。
- 提供 `tick` 方法供 `useFrame` 调用，计算下一帧的物理状态。

### 2. 事件捕获层：`ReactFlow3D` 容器 (DOM 冒泡)
- 依赖标准的 **DOM 事件冒泡** 机制。
- 当用户点击/拖拽 ReactFlow 的节点或控制面板时，ReactFlow 内部会处理并可能阻止冒泡，或者我们可以通过 `e.target.closest(...)` 判断是否命中了交互元素。
- 如果未命中交互元素，事件自然冒泡到最外层容器，触发 `useCameraStore.getState().startPan(...)` 等动作，将输入写入 Store。

### 3. R3F 渲染层：`Scene3D` (轮询/Polling)
- 在 R3F 的 `<Canvas>` 内部的 `useFrame` 循环中（每秒 60 次）。
- 调用 `useCameraStore.getState().tick()` 驱动物理引擎。
- 直接读取最新的 `Camera State`，修改 Three.js 的 `camera.position` 和 `camera.lookAt`。

### 4. React Flow 同步层：`Reactflow3D` (订阅/Subscribe)
- 在组件挂载时，使用 `useCameraStore.subscribe(...)` 监听状态变化。
- 当 `Camera State` 改变时，触发回调，**直接修改 DOM 元素的 `style.transform`**。
- 彻底绕过 React 的 `useState` 和渲染生命周期，实现极致性能的 2.5D 视角同步。

## 数据流向 (Data Flow)

1. **输入 (DOM 冒泡)**：
   鼠标/键盘 -> 目标 DOM 元素 (如 ReactFlow 节点) 
   -> 如果未被节点拦截 -> 向上冒泡 (上升) 
   -> `ReactFlow3D` 容器捕获事件 -> 触发 `useCameraStore.getState().startPan(...)` 更新 Store。

2. **物理计算 (Physics Tick)**：
   R3F `useFrame` (每秒 60 次) -> 调用 `store.tick()` -> 根据输入状态运行物理引擎 -> 更新 `Zustand Store (Camera State)`。

3. **3D 渲染 (Polling/Read)**：
   R3F `useFrame` -> 读取最新的 `Camera State` -> 直接修改 Three.js Camera 的 position 和 lookAt。

4. **2.5D 渲染 (Zustand Subscribe)**：
   `ReactFlow3D` 容器在挂载时 `subscribe` 监听 `Camera State` 的变化 
   -> 状态变化时触发回调 -> 直接修改 DOM 元素的 `style.transform` (绕过 React 渲染生命周期)。

## 优势
- **极致性能**：所有高频操作都在 `requestAnimationFrame` 或原生 DOM 操作中完成，React 树完全不参与渲染。
- **优雅的事件处理**：利用 DOM 原生的冒泡机制，摒弃了昂贵且容易出错的坐标命中测试。
- **解耦**：事件捕获、3D 渲染、2D 渲染完全解耦，只通过 Zustand Store 交流。
- **单一真实数据源 (SSOT)**：Zustand Store 是唯一的状态源，避免了状态不同步的问题。
