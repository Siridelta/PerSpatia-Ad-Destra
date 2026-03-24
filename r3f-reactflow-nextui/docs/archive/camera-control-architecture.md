# 相机控制架构 v2.0

## 设计理念：伪 3D 透视

我们使用**简化的透视方案**：
- **Three.js PerspectiveCamera**: 渲染真正的 3D 背景
- **CSS 3D 旋转 + ReactFlow Viewport**: ReactFlow 层只做旋转变换

这样 ReactFlow 看起来"大致在 3D 空间里"，但保持 2D 交互的简洁性。

## 坐标系定义

```
世界坐标系 (World Space)
├── XY 平面: ReactFlow 画布所在平面 (Z=0)
│   ├── X 轴: 向右为正
│   └── Y 轴: 向上为正
│
└── Z 轴: 深度方向，相机从 +Z 看向原点

相机参数:
├── target: {x, y}  // 相机看向 XY 平面上的点
├── radius: number  // 相机到 target 的距离（决定 zoom）
├── theta: number   // 水平环绕角度（绕 Y 轴，0=正面）
└── phi: number     // 垂直仰角（绕 X 轴，0=水平）

相机位置计算:
  camera.x = target.x + radius × sin(theta) × cos(phi)
  camera.y = target.y + radius × sin(phi)
  camera.z = radius × cos(theta) × cos(phi)
```

## 物理系统

### 平移
- **拖拽**: 直接 1:1 映射，鼠标不动则场景不动
- **键盘 WASD**: 指数逼近目标速度
- **惯性**: 松手后速度按阻尼衰减

### 旋转
- **右键拖拽**: 直接修改 theta/phi
- **惯性**: 松手后角速度衰减

### 缩放
- **滚轮**: 指数逼近目标 radius

### 配置参数
```typescript
const physicsConfig = {
  panDamping: 0.92,      // 平移阻尼
  panMaxSpeed: 2,        // 最大平移速度
  
  rotateDamping: 0.9,    // 旋转阻尼
  rotateMaxSpeed: 0.02,  // 最大角速度
  
  zoomDamping: 0.88,     // 缩放阻尼
  minRadius: 5,
  maxRadius: 100,
}
```

## 双视角同步

### ReactFlow Viewport
```typescript
viewport = {
  x: -targetX,           // 反向
  y: targetY,
  zoom: 30 / radius,     // 距离越近，zoom 越大
}
```

### CSS 3D 变换（简化版）
ReactFlow 容器只应用旋转，保持 2D 内容不变形：

```css
.react-flow-3d-container {
  transform-style: preserve-3d;
  transform: rotateX(${phi}rad) rotateY(${-theta}rad);
  perspective: ${(height / 2) / Math.tan(fov / 2)}px;
}
```

**为什么简化？**
1. ReactFlow 是 2D 工具，完整 3D 透视会让文字/控件变形
2. 旋转角度对齐已足够营造"3D 空间感"
3. 性能更好，兼容 ReactFlow 内置交互

## 事件流

```
Pointer Event
  ↓
ReactFlow3D 拦截层
  ├─ 命中节点/边 → 传给 ReactFlow 处理
  └─ 未命中 → 相机控制
        ├─ 左键拖拽: 平移 target
        ├─ 右键拖拽: 旋转 theta/phi
        └─ 滚轮: 缩放 radius
```

## ReactFlow 配置

必须禁用默认控制，完全由外部接管：

```jsx
<ReactFlow
  panOnDrag={false}
  zoomOnScroll={false}
  zoomOnPinch={false}
  zoomOnDoubleClick={false}
  panOnScroll={false}
  selectionOnDrag={true}
/>
```

## 文件结构

```
src/
├── hooks/
│   └── useCameraControl.ts      # 核心：相机状态 + 物理
├── components/
│   ├── Scene3D/                 # 3D 场景渲染
│   └── ReactFlow3D/             # ReactFlow 3D 容器
└── docs/
    └── camera-control-architecture.md
```

## 操作直觉与数学映射

### 为什么向右拖动 = 相机向左转？

**心智模型：拖动 = 抓住场景墙移动**

想象你和场景之间有一面"玻璃墙"（位于 z+ 方向）：
- **向右拖动** = 抓住墙往右拉
- 如果墙真的跟着动，它会**逆时针**旋转（从上往下看）
- 但墙不动，所以相机必须**顺时针**旋转来产生相同的视觉效果

**数学实现**（theta 增加时）：
```
相机位置 x = radius × sin(-theta)
theta↑ 时 sin(-theta)↓（负得更多）→ x 减小 → 相机向左移（顺时针）✓
```

**方向对照表**（拖动时看到更多哪一侧）：
| 拖动方向 | theta/phi 变化 | Three.js 坐标 | 结果 |
|---------|---------------|--------------|------|
| 右拖 | theta ↑ | `sin(-theta)` 减小 | 看到右侧 |
| 左拖 | theta ↓ | `sin(-theta)` 增大 | 看到左侧 |
| 下拖 | phi ↑ | `sin(phi)` 增大 | 看到下方 |
| 上拖 | phi ↓ | `sin(phi)` 减小 | 看到上方 |

**CSS 同步**：
- CSS `rotateY(theta)` 正方向 = 顺时针
- 所以直接用 `theta`（不用负号）即可与 Three.js 视角对齐

## 注意事项

1. **精度**: CSS 和 WebGL 浮点精度略有差异，极端角度可能有 1-2px 偏差
2. **性能**: `will-change: transform` 优化 CSS 动画
3. **边界**: phi 限制在 (-89°, 89°) 避免万向锁
