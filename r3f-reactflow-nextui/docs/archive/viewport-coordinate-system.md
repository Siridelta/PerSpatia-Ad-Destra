# Viewport 坐标系统文档

## 核心概念：这是一场精心设计的"骗局"

### 原本想要什么

直觉上，滚轮缩放应该很简单：
```
用户滚轮 → 改变相机距离 → 看到更多/更少内容
```

用 Three.js 的术语：
```typescript
// 理想中的实现
camera.position.z = baseDistance / zoomLevel;
// 滚轮向上 → zoomLevel 增大 → camera.z 减小 → 拉近相机
```

### 为什么做不到

**性能问题**：当相机拉远时，视野范围变大，3D场景需要渲染更多物体。

在复杂的 ReactFlow 图表+3D背景场景下，保持60fps已经很紧张。如果允许相机无限制拉远：
- 视锥体(frustum)包含的物体指数级增长
- GPU 瞬间爆炸

### 所以我们是怎么办的

**假的3D缩放，真的2D缩放**：
```
用户滚轮 → ReactFlow zoom 变化 → CSS transform scale
                ↓
         3D相机保持固定距离
                ↓
         通过 viewport.zoom 调整"假象"
```

**关键点**：
- **OrbitControls 的旋转中心(target)固定在世界原点** (0,0,0)，不会改变
- 相机可以绕着这个中心旋转（用户拖拽改变角度），但始终保持固定距离
- 2D 层通过 CSS transform 做缩放
- 3D 层"假装"自己也在缩放/平移，通过微调 target 偏移量（基于 viewport 位置计算）

**相机实际行为**：
```
相机位置 = 固定距离 × 旋转角度
          ↓ 微调
       target 偏移量（基于 viewport.x/y 计算）
```

这就是为什么叫"假象"——**用户在"拉远"，但相机距离根本没变**，只是：
1. 2D层通过 CSS 缩小了
2. 3D层的 target 做了微小偏移，制造"跟随"的错觉

### 两个世界

- **2D世界**：ReactFlow的节点编辑器（用户操作的主要界面）
- **3D世界**：Three.js的背景场景（纯视觉效果，不可交互）

关键设计原则：**3D世界只是2D世界的"倒影"**，它不独立存在，完全服从2D视口的状态。

---

## 坐标系定义

### 1. ReactFlow Viewport (2D世界)

```
坐标系: 屏幕像素，左上角为原点，右下为正方向
  y
  ↓
  ┌─────────────┐
  │   (0,0)     │
  │      ●───→x │
  │             │
  └─────────────┘

viewport = {
  x: number,      // 相机偏移（像素）
  y: number,      // 相机偏移（像素）
  zoom: number    // 缩放倍率（1 = 100%）
}
```

**重要**：`x`和`y`表示**相机的偏移量**，不是场景中心的位置。
- `x = 100` 意味着相机向右移动了100px，场景看起来向左移动了
- `zoom = 2` 意味着所有内容放大2倍

### 2. Three.js Scene (3D世界)

```
坐标系: 世界坐标，中心为原点，右手系
       y
       ↑
       │
  x ←──┼──→ -x
       │
       ↓ -y
      /
     z (指向屏幕外)
```

**核心限制**：
- `OrbitControls.enablePan = false` - 禁止直接平移
- `OrbitControls.enableZoom = false` - 禁止直接缩放
- `OrbitControls.enableRotate = true` - 只允许旋转（用于看不同角度）

**为什么？** 因为平移和缩放必须由2D视口"主导"，3D只是跟随。

---

## 映射公式

### 2D Viewport → 3D Camera Target

```typescript
// 2D viewport位置映射到3D场景的观察目标
// 目标：当2D视口移动时，3D相机看向对应的"虚拟位置"

// 核心映射关系
const sensitivity = 0.01;  // 2D像素 → 3D世界单位的转换系数

targetX = -viewport.x * sensitivity / viewport.zoom;
targetY = viewport.y * sensitivity / viewport.zoom;
targetZ = 0;

// 相机位置（保持固定距离，只做旋转）
cameraX = targetX;
cameraY = targetY;
cameraZ = 10 / viewport.zoom;  // 缩放时拉近/拉远
```

**符号解释**：
- `targetX = -x`：2D相机右移(x>0)，3D目标左移，看起来场景向左移动
- `/ zoom`：放大时，3D目标移动范围缩小（保持视觉一致性）

### 伪深度效果

```typescript
// 3D场景中的物体位置
const position = [
  node.x * sensitivity,           // x坐标直接映射
  -node.y * sensitivity,          // y坐标翻转（2D y向下，3D y向上）
  depth * depthScale              // z坐标制造"前后层"效果
];

// 深度缩放因子（保持透视感）
const depthScale = 0.5 / viewport.zoom;
```

**这不是真正的3D透视**，只是：
1. 把2D节点位置映射到3D平面上
2. 给每个节点一个"伪深度"值
3. 用透视相机渲染出"看起来像3D"的效果

---

## 用户交互的处理流程

### 滚轮缩放

```
用户滚轮
  ↓
ReactFlow 捕获 wheel 事件
  ↓
ReactFlow 内部计算新的 zoom
  ↓
onViewportChange 回调
  ↓
usePanAndZoomControl 更新 viewport 状态
  ↓
syncTo3DScene() 计算新的 camera position/target
  ↓
OrbitControls target/position 被设置
  ↓
3D场景重渲染
```

### 键盘平移

```
用户按 W/A/S/D
  ↓
usePanAndZoomControl 捕获 keydown
  ↓
计算速度/加速度 (物理模拟)
  ↓
requestAnimationFrame 循环更新 viewport.x/y
  ↓
调用 reactFlowInstance.setViewport()
  ↓
ReactFlow 渲染新的视口
  ↓
onViewportChange 触发
  ↓
syncTo3DScene() 更新 3D 相机
```

---

## 关键设计决策

### 为什么是"2D主导"而不是"3D主导"？

**2D主导**（当前方案）：
- ✅ ReactFlow的节点编辑是核心功能，必须流畅
- ✅ 3D只是装饰，可以"跟丢"或"延迟"
- ✅ 用户不会注意到3D的微小偏差
- ❌ 需要手动同步两套系统

**3D主导**（另一种方案）：
- ✅ 只用一套坐标系
- ❌ ReactFlow的平移/缩放要用自定义实现
- ❌ 节点编辑功能需要大量重写

### 为什么用 OrbitControls 而不是手动相机？

OrbitControls 提供了：
- 平滑的旋转阻尼
- 角度限制（防止穿地）
- 自动处理鼠标拖拽旋转

我们只是"劫持"了它的 target/position，禁用了它自带的平移/缩放。

---

## 调试指南

### 常见问题诊断

| 现象 | 可能原因 | 检查点 |
|------|---------|--------|
| 3D场景不动 | syncTo3DScene 没调用 | 检查 onViewportChange 回调 |
| 3D移动方向相反 | 符号错误 | 检查 `-x` 和 `y` 的符号 |
| 缩放时3D移动过快 | 忘记 `/ zoom` | 检查 target 计算公式 |
| 键盘平移无效 | 事件被拦截 | 检查 capture phase / preventDefault |

### 快速验证

在浏览器控制台运行：
```javascript
// 获取当前 viewport
__REACT_FLOW__.getViewport()

// 手动移动
__REACT_FLOW__.setViewport({x: 100, y: 0, zoom: 1})

// 观察 3D 相机位置
scene3D.camera.position
```

---

## 未来可能的改进

1. **真正的3D节点**：让2D节点有对应的3D模型，可以飞入飞出
2. **深度交互**：根据鼠标位置计算3D射线，与场景交互
3. **多视角**：保存/切换不同的3D相机角度预设
4. **视差效果**：不同深度的节点以不同速度移动
