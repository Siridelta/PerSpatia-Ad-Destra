# 相机控制架构 v2.0

## 设计理念：双透视对齐

我们同时运行两个透视投影系统，并保持它们完全同步：
- **Three.js PerspectiveCamera**: 渲染 3D 背景
- **CSS 3D Transform**: 控制 ReactFlow 容器的 3D 变换

这样 ReactFlow 看起来就像"贴在 3D 场景里的一面墙"，但实际上是独立的 DOM 层。

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
├── radius: number  // 相机到 target 的距离
├── theta: number   // 水平环绕角度（绕 Y 轴，0=正面）
└── phi: number     // 垂直仰角（绕 X 轴，0=水平）

相机位置计算:
  camera.x = target.x + radius × sin(theta) × cos(phi)
  camera.y = target.y + radius × sin(phi)
  camera.z = radius × cos(theta) × cos(phi)
```

## 物理系统（统一指数逼近）

所有运动使用同一套物理模型：

### 加速模式（按键/滚轮）
```
value = target + (value - target) × damping
```
- 平移：WASD 改变 target.x/y，速度指数逼近 maxSpeed
- 旋转：鼠标拖拽改变 theta/phi，角速度指数逼近 maxAngularSpeed
- 缩放（距离）：滚轮改变 radius，指数逼近目标距离

### 减速模式（松手）
```
velocity = velocity × damping
value = value + velocity
```
- 松开后速度按阻尼衰减，直到低于阈值停止

### 配置参数
```typescript
const physicsConfig = {
  panDamping: 0.85,      // 平移阻尼
  panMaxSpeed: 2,        // 最大平移速度 (world units/frame)
  
  rotateDamping: 0.9,    // 旋转阻尼
  rotateMaxSpeed: 0.02,  // 最大角速度 (radians/frame)
  
  zoomDamping: 0.88,     // 缩放阻尼
  minRadius: 5,          // 最近距离
  maxRadius: 100,        // 最远距离
}
```

## 透视同步

### CSS Transform 计算
ReactFlow 容器需要应用与相机相反的变换，让它"看起来"在正确位置：

```css
.react-flow-wrapper {
  transform-style: preserve-3d;
  transform:
    /* 1. 移动到屏幕中心 */
    translate(-50%, -50%)
    translate3d(50vw, 50vh, 0)
    
    /* 2. 应用相机透视 */
    translateZ(${-radius}px)
    rotateX(${-phi}rad)
    rotateY(${theta}rad)
    
    /* 3. 平移补偿 */
    translate3d(${-target.x}px, ${target.y}px, 0);
    
  /* 透视匹配 Three.js FOV */
  perspective: ${(height / 2) / Math.tan(fov / 2)}px;
}
```

### 坐标转换流程

**屏幕 → 世界** (用于判断命中):
```
screen (x, y)
  ↓ unproject with Three.js camera
ray (origin, direction)
  ↓ intersect with Z=0 plane
world (wx, wy, 0)
  ↓ apply inverse CSS transform
local (lx, ly) for ReactFlow
```

**世界 → 屏幕** (用于 3D gizmo 等):
```
world (wx, wy, wz)
  ↓ project with Three.js camera
screen (x, y)
```

## 事件流

```
Window Pointer Event
  ↓
拦截层 (CameraEventInterceptor)
  ├─ 转换为世界坐标
  ├─ 检查是否命中 ReactFlow 元素
  │   ├─ 是 → 转换为局部坐标 → 创建合成事件 → 传给 ReactFlow
  │   └─ 否 → 进入相机控制模式
  ↓
相机控制
  ├─ 左键拖拽: 平移 target (XY平面滑动)
  ├─ 右键拖拽: 旋转相机 (改变 theta/phi)
  └─ 滚轮: 改变 radius (缩放)
```

## ReactFlow 配置

ReactFlow 需要禁用默认的视口控制，完全由外部接管：

```jsx
<ReactFlow
  panOnDrag={false}      // 禁用拖拽平移
  zoomOnScroll={false}   // 禁用滚轮缩放
  zoomOnPinch={false}    // 禁用双指缩放
  zoomOnDoubleClick={false}
  panOnScroll={false}
  selectionOnDrag={true} // 允许框选
  // 保留节点拖拽、连接等交互
/>
```

## 文件结构

```
src/
├── hooks/
│   └── useCameraControl.ts      # 核心：相机状态 + 物理 + 同步
├── components/
│   ├── Scene3D/
│   │   └── index.tsx             # 3D 场景，接收 camera 状态
│   └── ReactFlow3D/
│       └── index.tsx             # ReactFlow 容器，应用 CSS 3D 变换
├── utils/
│   └── coordinateTransform.ts    # 坐标转换工具函数
└── docs/
    └── camera-control-architecture.md  # 本文档
```

## 注意事项

1. **性能**: 每帧更新 CSS transform 可能触发重排，使用 `will-change: transform` 优化
2. **精度**: CSS 和 WebGL 的浮点精度略有差异，远距离可能出现 1-2px 偏差
3. **事件冒泡**: 合成事件需要正确处理 `stopPropagation` 避免循环
4. **边界情况**: 当 phi 接近 90°（垂直俯视）时，鼠标平移逻辑需要特殊处理
