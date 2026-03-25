# 从 2D React Flow 到用户眼中的「3D 空间」

下文顺序：**实现梗概** → **数据流向与四层分工**（输入如何进 store、`tick` 如何读、输出如何分到 Three / CSS / viewport）→ **第一部分**升维叙事（用户看到什么）→ **第二部分**公式与排错。更旧实现见 [`archive/`](./archive/README.md)；美学动机与 **竖直墙面 + 平视纵深** 等空间约定见 [per-spatia-visual-language.md](./per-spatia-visual-language.md)。

---

## 实现梗概（几句话）

结构上就是 **两个大块叠在一起**：底层是 **R3F（Three.js）的真 3D 场景**，上层是 **React Flow 组件盖住 3D**（典型 z-index / 叠层布局）。对 **React Flow 这一层** 做 **CSS 3D 变换**（`perspective`、`rotateX` / `rotateY` 等），并配合 **React Flow 的 `viewport` API**（`x` / `y` / `zoom`），让 2D 节点图在视觉上像是 **同一场景里、贴在竖直墙面（XY）上的内容**，而原来的 React Flow zoom 的逻辑自然转变成 3D 的 **Z 纵深**。同时 **在容器层接管指针/滚轮/键盘**（节点内仍交给 RF），统一 **驱动模拟相机**，模拟相机再同步到背后 Three 相机、前面 CSS 朝向和 React Flow `viewport`。

数据流上不以 React `useState` 为主轴，而是以 **`<CameraControl>` 内的 Zustand store（`useCameraControl` / `useCameraControlStore`）为中心**：利用其 **同步、可在外部 `getState` / `subscribe`** 的特性，绕开「一切先回 React 再下发」的高频重渲染路径。R3F 里用 **`useFrame`** 每帧调用 `tick()`、读 store、写真实 **PerspectiveCamera**，从而 **高性能地** 把相机相关状态、3D 背景与 2.5D RF 层 **绑在同一条时间轴上**。

---

## 数据流向与四层分工

### 数据流向：从输入到「假象」

1. **输入先进入 React Flow 子树**  
   指针 / 键盘 / 滚轮落在画布区域内的某个 DOM 上 → **分支**：若命中 **节点、边、Handle、面板、Controls、MiniMap** 等由 React Flow 或业务接管的 UI，则 **由它们消费**，**不**当作「拖画布 / 转相机」；若 **没有**被这些层吃掉，事件 **向上冒泡**，最终到达外包层 **`ReactFlow3D` 容器**上的监听——这是 **画布级相机** 的入口（DOM 冒泡语义下的「拦截 / 兜底」层）。

2. **事件序列只负责把数据写进 store 的「输入侧」**  
   指针 / 滚轮经 `ReactFlow3D` 冒泡路径写入 store；**键盘**等也可在 **`Canvas` / `window` 层**统一监听后直接调 `handleKeyDown` / `handleKeyUp`（**不**经过 RF DOM 冒泡，但同样是 **只写 `input`**，与下文的 `tick` 关系相同）。  
   **关键**：**事件时间线**与 **`useFrame` / `tick` 时间线互不绑定、互不阻塞**——不需要「每个 `pointermove` 都触发一次 tick」；反过来，**`tick` 每一动画帧主动 `get()` 读取当前 input**，再算本帧物理。**两边只在 Zustand store 上交会**，没有强耦合的调用顺序。

3. **`Scene3D` 里的 `useFrame`：驱动物理、产出模拟相机**  
   每帧：`tick()` 读取 store 中的 **input + physics**，做阻尼、惯性等，更新 **`cameraState`**（以及 physics 内部量）。这是与 **浏览器 RAF** 对齐的 **主时钟**：相机「真相」在这里被推进。

4. **`cameraState` 的三路消费（如何把数写回画面）**  
   - **Three.js 场景**：仍在 **`useFrame`** 里、于 `tick()` **之后** **轮询读取**最新 `cameraState`，写入 R3F 的 **`PerspectiveCamera`**（**不是**靠 Zustand `subscribe` 驱动这一支，避免与渲染循环脱节）。  
   - **ReactFlow3D（CSS 2.5D 壳）**：组件内对 store **`subscribe`**，在 `cameraState` 变化时 **直接改 DOM** 的 `transform` / `perspective`，**不**走 React `setState`。  
   - **React Flow 的 `viewport` API**：**`ReactFlowViewportSync`**（挂在 **`ReactFlow3D`** 内）根据 **`cameraState` 派生**视口，通过 **`setViewport`** 推送平移与缩放；**旋转**仍只由 CSS + Three 表达，`viewport` 本身不带 θ/φ。  

5. **「假象」由谁拼**  
   **同一份 `cameraState`** 下，`ReactFlow3D`（CSS + 内嵌 **`ReactFlowViewportSync`** 写 RF `viewport`）与 **`Scene3D`（Three）** 各自消费同一 store，使 2D 节点层与 3D 背景在 **平移、缩放、倾斜** 上 **看起来** 像同一块空间里的两层。**`CanvasData` 不存 RF viewport**，视口仅为 RF 运行期执行细节。

### 四层分工（角色一览）

与上节一一对应，方便 fresh reader 建立心智模型：

1. **状态中心：`CameraControl` 提供的 store** — 唯一 SSOT：相机参数、`input`、physics、`tick()`、`screenToPlane` 等；事件与 `useFrame` 都只跟它说话（`useCameraControl` / `getState()`）。  
2. **事件捕获层：`ReactFlow3D` 容器（DOM 冒泡）** — 子树未消费的指针/滚轮在此入库；命中节点/边等则 **不**抬相机。  
3. **R3F 渲染 / 物理时钟层：`Scene3D`（`useFrame`）** — 每帧 `tick()`、**读** input、**写** `cameraState`；**同帧**再 **读** `cameraState` **写** Three 相机（轮询）。  
4. **React Flow 同步 / 2.5D 呈现层：`ReactFlow3D`** — `subscribe` → CSS；**`ReactFlowViewportSync`** → 派生 RF `viewport` 并 **`setViewport`**；与 **`CanvasData`/持久化无关**。

---

## 第一部分：我们呈现给用户的是什么（升维叙事）

### 1.1 起点：React Flow 本来是纯 2D

React Flow 只原生理解 **平面画布**：节点、边、视口的 **`x, y, zoom`**（平移与缩放）。**没有**「倾斜整块画布、带纵深地看」这种第三自由度的原生表达；那是我们在外层用相机 + CSS 补上的。

### 1.2 升维策略：同一套「虚拟相机」同时驱动两层画面

我们把**整张 RF 画布**想象成 **立在三维世界里的一面墙**：落在 **XY 平面、Z = 0**——**XY 竖直**（Y 为竖直轴、X 沿墙水平），**Z 为水平纵深**（垂直于墙面伸向场景深处）；详见 [per-spatia-visual-language.md](./per-spatia-visual-language.md)。

用户要的 **3D 感**来自两件事**同步变化**：

1. **真 3D 背景**（R3F / Three.js）：用**透视相机**在纵深方向上有星空、地面等；相对 **墙面**上的注视点做 **平移、沿 Z 拉远/拉近、小范围绕注视点摆动**，营造「墙背后还有空间」。**设计上**不要 **360° 绕场飞**，且 **不应偏离「平视这面墙」太远**（不是「俯视桌面」）；后续会收紧 `theta`/`phi` 可偏范围（与 PerSpatia 视觉意图一致，见 [per-spatia-visual-language.md](./per-spatia-visual-language.md)）。
2. **仍是 2D 的节点图**（React Flow DOM）：**不**把节点改成真 mesh；而是给 RF 外包一层 **CSS 3D**（`perspective` + `rotateX` / `rotateY`），让整块画布像 **墙上的屏**被 **轻微** 倾斜、转向，和 3D 背景的朝向大体一致。

因此：**「升维」不是把 RF 数学升级成真 3D 图论，而是视觉与交互上共用一套相机语言**（目标点、距离、水平角、俯仰角），让 2D 编辑区与 3D 背景**看起来像同一场景里的两层**。

### 1.3 用户操作分别改变了什么（感知层）

| 用户操作 | 用户感知 | 实现上主要改什么 |
|----------|----------|------------------|
| 左键拖画布 | 在墙面上平移内容 | `targetX` / `targetY`（+ 物理阻尼）；RF `viewport.x/y` 与之对齐 |
| 滚轮 | 拉近 / 拉远 | `radius` ↔ `viewport.zoom`（`zoom = 30 / radius`） |
| 右键拖 | 微调观看角度（纵深 / 斜视感，非自由环视） | `theta` / `phi`；CSS 与 Three 相机共用同一组角；`phi` 在代码里已夹紧，产品侧还将收紧可偏转范围 |
| WASD | 平移惯性 | 速度通道进 `tick`，同样落到 `targetX/Y` |

平移在 **墙面（Z=0）** 上的 1:1 手感，靠 **`screenToPlane` 射线打到该平面** 的差分（见第二部分），而不是只挪像素假装平移。

### 1.4 刻意保留的限制（为什么 RF 里仍「只有 2D 视口」）

React Flow API **只能稳定表达** `viewport: { x, y, zoom }`，**不包含**水平角、俯仰角。

因此：

- **旋转**只存在于我们的 **`cameraState.theta / phi`** 和 CSS / Three 里，**写不进**标准 viewport。
- 若用 `onMoveEnd` 等回调把 **viewport 反写回相机**，只能恢复平移与缩放，**会丢掉或冲掉旋转**，破坏「墙与背景朝向一致」的一致性。正确做法是 **相机 store（`CameraControl` 内）为 SSOT**，单向把派生 viewport 推给 RF（见第二部分）。

### 1.5 「伪 3D」到什么程度（和旧文档的关系）

历史上曾用 OrbitControls + 强调「假缩放」的叙事，见 [`archive/viewport-coordinate-system.md`](./archive/viewport-coordinate-system.md)。**当前**是 **自定义相机 + `radius` 与 `zoom` 联动**，不必再按「相机距离完全不动」理解。

不变的是：**编辑主舞台仍是 2D RF**；3D 负责氛围与对齐；**能用 RF 表达的只有 `x, y, zoom`**，所以从 RF 反推整套相机若不带旋转维度，一定和升维方案冲突。

---

## 第二部分：工程如何实现（与代码对齐，信息全集）

面向**第一次改这块代码**的人或 AI agent：状态在哪、事件从哪进、谁写 React Flow、不要踩哪些坑。

### 2.1 一句话（SSOT）

**`CameraControl` 创建的 Zustand store 是相机与视口的唯一真实来源**（每块画布一份，非全局单例）。**`CameraControl`** 内全屏输入层把指针/滚轮写入 store，并由 `shouldIgnoreCameraForTarget`（如 `pointerPolicy.shouldIgnorePointerForCameraRf`）决定何时忽略；同组件内还负责 **resize → `setViewportSize`**、**WASD 等键盘相机**（非可编辑焦点时）；R3F `useFrame` 里 `tick()` 做物理并驱动 Three.js 相机；`ReactFlow3D` 用 `subscribe` 改 CSS 3D 的 `transform` / `perspective`，并由 **`ReactFlowViewportSync`**（`useReactFlow`，与 `<ReactFlow>` 兄弟即可，只要外层已有 `ReactFlowProvider`）把派生 viewport **单向** `setViewport` 推给 RF。**不要用 RF 的 `onMoveEnd` 把 viewport 反写进相机**，否则会丢掉 `theta`/`phi`。若需在 `Canvas` 内命令式读写相机，可在该文件里保留 `useRef<CameraControlRef>` 传给 `<CameraControl ref={...}>`。

### 2.2 代码地图（改功能时先打开这些）

| 路径 | 职责 |
|------|------|
| `src/components/CameraControl/cameraStore.ts` | `createCameraStore`、`CameraState`、球坐标默认/夹紧常量；`tick`、`screenToPlane` 等 |
| `src/components/CameraControl/CameraControl.tsx` | `CameraControl`：store + Context + 全屏输入层 + ref + resize/键盘相机；`shouldIgnoreCameraForTarget` 由外部注入（如 `pointerPolicy`） |
| `src/components/CameraControl/CameraDebugHud.tsx` | 调试用 HUD；由 `Canvas` 作为子组件挂载（内部 `useCameraControl`） |
| `src/components/ReactFlow3D/pointerPolicy.ts` | `RF_EMPTY_SURFACE_ATTR`、`shouldIgnorePointerForCameraRf`（CameraControl 不写 RF 类名） |
| `src/components/ReactFlow3D/index.tsx` | `subscribe` 更新 transform / perspective；内嵌 `ReactFlowViewportSync`（指针由 `CameraControl` 处理） |
| `src/components/ReactFlow3D/ReactFlowViewportSync.tsx` | 订阅相机 store，`useReactFlow().setViewport` 单向同步 RF（阈值防抖） |
| `src/components/ReactFlow3D/shellCssMath.ts` | 外壳 `perspective`、与 θ/φ 配套的 `transform` 字符串（纯函数） |
| `src/components/Scene3D/index.tsx` | `useFrame` 调 `tick()`、同步 Three.js `PerspectiveCamera`；背景组缩放每帧按 `30/radius`；**Canvas 外**取 store 经 props 传入 R3F 子树（R3F 子树不继承外层 Context） |
| `src/hooks/useCanvasData.ts` | 画布 Zustand：`uiData` / `flowData`（仅 nodes+edges）/ **`camera`** 平级；**无** `viewport`；`writeCamera.setCamera` 接 `CameraControl.onPersist` |
| `src/components/Canvas/index.tsx` | 单一 `Canvas`：`CameraControl` + `ref` 做 hydrate `setCameraState`；**不在此文件用 `useCameraControl`**；`readCamera.useCamera`；`useReactFlow` 用于 `screenToFlowPosition`；子组件 `CameraDebugHud` |

### 2.3 坐标系与相机参数（与世界 / RF 对齐）

**世界系（Three.js）**

- React Flow 画布落在 **XY 平面，Z = 0**；在 PerSpatia 约定里把 **XY 读作竖直墙面**（**Y 竖直**、**X 沿墙水平**），**Z 为水平纵深**（法向大致对应「平视」看向墙时的视线深度）。
- **X**：沿墙向右为正；**Y**：竖直向上为正；**Z**：纵深（相机常在 **Z 正方向一侧** `lookAt` 墙上的点），右手系。

**Store 里的 `cameraState`（与 `updateSimulatedCamera` 一致）**

- `targetX`, `targetY`：相机注视点在 XY 平面上。
- `radius`：相机到该点的距离；与 React Flow 的 `zoom` 约定为 **`zoom = 30 / radius`**（见 `ReactFlowViewportSync` 与 `Scene3D` 背景缩放）。
- `theta`、`phi`：**与 `THREE.Spherical` / `Vector3.setFromSphericalCoords(radius, phi, theta)` / drei OrbitControls 内部约定一致**（见 Three 文档与 `three.core.js` 中 `Spherical`）。
- `tick` 里将 `phi` 夹在 **`(SPHERICAL_PHI_MIN, SPHERICAL_PHI_MAX)`**（约 `0.01`～`π - 0.01`），等价于 `Spherical.makeSafe` 量级，避免极点；**+Z 锥体**等产品向约束留待后续与物理一起设计。

**相机位置（实现直接调用 Three API，便于对照）**

```text
position.setFromSphericalCoords(radius, phi, theta)
position.x += targetX
position.y += targetY
lookAt(targetX, targetY, 0)
```

展开后与 Three 一致：

```text
x = targetX + radius * sin(phi) * sin(theta)
y = targetY + radius * cos(phi)
z = radius * sin(phi) * cos(theta)
```

#### `theta` / `phi`：零点与正方向（与 OrbitControls 对齐）

**零点（默认 `initialTheta = 0`、`initialPhi = π/2`，常量 `DEFAULT_SPHERICAL_PHI`）**

- 注视点在 **`(targetX, targetY, 0)`**（墙面 z=0）。
- **`theta = 0` 且 `phi = π/2`（赤道）**：相对注视点偏移 **`(0, 0, +radius)`**，沿 **+Z** **正视墙**，即产品上的 **平视基准**。
- **`phi`**：从 **+Y** 向下的极角；**小于 π/2** 偏向 **+Y**（更高），**大于 π/2** 偏向 **-Y**（更低）。
- **`theta`**：在 **XZ** 平面内从 **+Z** 起算的方位角（与 `Math.atan2(x, z)` 一致）。

**指针映射**：右键拖时 **`theta -= dx * sens`**（与 Spherical 正向相反），以保留迁移前大致的左右手感；**`phi -= dy * sens`**（纵向与默认 `dy→phi` 映射手感相反，若仍反可再改符号）。可调。

**与 OrbitControls**：`getAzimuthalAngle()` / `getPolarAngle()`（或内部 `spherical`）可与本 store 的 **`theta` / `phi` 直接对照**（注意 Orbit 的 target 与 min/max 限制仍由自研 `tick` 负责）。

#### 视角约束：我们要的是「+Z 锥体」，不是 drei 那种「分角夹逼」

产品上要的是：视线大致沿 **正视墙时的法向** 活动，偏离不能太大——几何上写成 **以该法向为轴的圆锥**（或相机方向与 **+Z** 夹角上限）。

**@react-three/drei** 的 `OrbitControls` 仍主要是 **对 polar/azimuth 做区间限制**（在 **同一套 Spherical 角** 上切盒），**不等于**「绕视轴的锥体」；锥体约束需在自研 **`tick`** 里对 **方向向量** 做夹逼并与物理整合。**当前**仅 **phi 全范围安全夹紧**，锥体未实现。

**React Flow `viewport`（仅表达平移+缩放，不含旋转）**

```text
viewport.x = -targetX
viewport.y = targetY
viewport.zoom = 30 / radius
```

旋转只靠 **CSS**（`ReactFlow3D` 内层）与 **Three** 相机共同使用同一套 `theta`/`phi`，而不是写在 `viewport` 里。

### 2.4 输入与物理（行为级说明）

- **左键拖拽平移**：只存 **`lastPointerScreen`**，不缓存平面上的点。每次 `pointermove` 用**当前** `cameraState` 更新后的模拟相机做两次 `screenToPlane`（上一屏点、当前屏点），取平面差分推到 `panOffset`。这样「上一帧相机」和「当前帧相机」一致，避免旧算法里「平面点存在旧相机下」导致的跳变与行程缩水。
- **右键拖拽旋转**：用屏幕像素差分改 `rotateOffset`（与平移独立的阻尼通道）。
- **WASD / 松手惯性**：速度型通道；具体阻尼与阈值以 `cameraStore` 内 `DEFAULT_CAMERA_OPTIONS` 与 `tick` 为准。
- **滚轮**：改 `targetRadius`，`tick` 里阻尼逼近。
- **同时按住左+右**：`handlePointerMove` 里 **`isRotating` 分支优先**（`else if`），仅旋转分支会更新 `lastPointerScreen`；若需要真正的双通道同时拖拽，要改分支策略（当前未做）。

### 2.5 数据流（提要）

完整叙述（输入 → store → `tick` → 三路消费、事件与 RAF 解耦、四层角色）见文档前部 **「数据流向与四层分工」**。此处只留纲要：

| 阶段 | 做什么 |
|------|--------|
| DOM | RF 子树优先消费事件；否则冒泡至 `ReactFlow3D` → 写入 store **`input`** |
| RAF | `Scene3D` `useFrame` → `tick()` **读** input → **写** `cameraState` → **读** `cameraState` **写** Three 相机 |
| 订阅 / React | `ReactFlow3D` **subscribe** → CSS；**`ReactFlowViewportSync`** 派生视口 → **`setViewport`** |

### 2.6 React Flow 集成要点

- **必须关掉 RF 自带平移/缩放**（否则与自定义控制打架），例如：`panOnDrag={false}`、`zoomOnScroll={false}` 等（具体以 `Canvas` 里实际 props 为准）。
- **`ReactFlowViewportSync` 用派生视口 + `setViewport`** 把 store 推到 RF；与当前 RF 视口差异小于阈值时不写，减轻循环抖动。
- **勿在 `onMoveEnd` 用 viewport 反写 store**：viewport 只有 `x/y/zoom`，**没有 `theta/phi`**，反复反写会把旋转状态搞乱。

### 2.7 持久化（v10）

**`CanvasArchiveState`** 中 **`uiData` / `flowData` / `camera` 三者平级**；**不序列化** RF `viewport`。完整 **`CameraState`（含 `theta`/`phi`）** 写入 **`camera`**；`useCanvasStatePersistence` 在 **ui / flow / camera** 变化时 `exportCanvasData`。旧档 **v9 及以前** 的 `flowData.viewport` 由迁移 **`v9ToV10`** 映射进 **`camera`**。

### 2.8 操作直觉与 CSS 符号

心智模型：**拖拽像在抓「面前的玻璃」**。向右拖希望看到更多右侧内容，对应实现里对 `theta`/`phi` 的符号与相机公式耦合；若调试时觉得「方向反了」，应对照 `updateSimulatedCamera` 与 `ReactFlow3D` 的 `rotateX`/`rotateY` 符号一起改，避免只改一侧。

**CSS 与 Three 的符号**：`shellCssMath.ts` 中 `buildShellTransform` 生成 `rotateX((phi - π/2)rad) rotateY((-theta)rad)`，相对裸 Spherical 在 DOM 上对 θ、φ 各取反一层，使 2.5D 与 Three 画面同向；改符号时请与 `updateSimulatedCamera` 对照。

### 2.9 常见问题（排错）

| 现象 | 优先查 |
|------|--------|
| 一转视角再平移就跳 | 是否仍缓存了「旧相机下的平面点」；应用「仅 `lastPointerScreen` + 当帧双射线」方案 |
| 旋转突然被清零 | RF 回调里是否用 viewport **反写**了相机（无 θ/φ）；或 hydrate / 导入是否覆盖了 `camera` |
| 3D 与 2D 不同步 | `subscribe` 是否生效、`viewportSize` 是否与窗口一致、派生视口公式（`30/radius` 等）是否改动 |
| 节点上拖动画布 | `ReactFlow3D` 的 `closest` 选择器是否覆盖该类节点容器 |

### 2.10 归档里还有什么

- **`archive/usePanAndZoomControl.md`**：`usePanAndZoomControl` + `onMoveEnd` 反向同步——**已非当前主线**，保留作历史对比。
- **`archive/camera-control-architecture.md`**：坐标与操作直觉仍有用，但文中的文件路径与钩子名已过期。
- **`archive/viewport-coordinate-system.md`**：Orbit 时代的「骗局」叙事；**缩放部分勿照搬**，仅作背景阅读。

本文档应随 `cameraStore` / `ReactFlow3D` / `Canvas` 行为变更而更新；若只改实现未改文档，后续读者会再次迷路。
