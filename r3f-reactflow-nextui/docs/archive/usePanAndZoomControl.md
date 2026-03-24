# usePanAndZoomControl 使用说明

## 概述

`usePanAndZoomControl` 是一个统一的相机控制钩子，用于接管 Canvas 组件中除旋转外的所有相机操作（缩放和平移）。

## 功能特性

1. **统一事件接管**：滚轮缩放、键盘平移（WASD）
2. **内置状态管理**：viewport `{x, y, zoom}`
3. **双向同步**：
   - 主动更新 ReactFlow 2D 画布和 3D 场景
   - 检测外部 viewport 变化（如用户拖拽）并反向同步
4. **3D 场景同步**：
   - zoom → 3D 元素缩放
   - x,y → OrbitControls target 偏移
5. **旋转独立**：OrbitControls 保留右键旋转

## 使用方法

### 基本用法

```tsx
import { usePanAndZoomControl } from '@/hooks/usePanAndZoomControl';

function Canvas() {
  const {
    viewport,           // 当前 viewport 状态 {x, y, zoom}
    setViewport,        // 手动设置 viewport
    sceneScale,         // 3D 场景缩放系数 (= zoom)
    setOrbitControls,   // 设置 OrbitControls 引用
    setReactFlowInstance, // 设置 ReactFlow 实例
    syncFromReactFlow,  // 从 ReactFlow 反向同步
  } = usePanAndZoomControl({
    initialViewport: { x: 0, y: 0, zoom: 1 },
    minZoom: 0.1,
    maxZoom: 3,
  });

  // 使用 viewport 同步到 ReactFlow 和 3D 场景
  // ...
}
```

### 与 ReactFlow 集成

```tsx
const handleInit = useCallback((instance) => {
  flowInstanceRef.current = instance;
  setReactFlowInstance(instance);
}, [setReactFlowInstance]);

// 同步 viewport 到 ReactFlow
useEffect(() => {
  if (flowInstanceRef.current) {
    flowInstanceRef.current.setViewport(controlledViewport);
  }
}, [controlledViewport]);

// 反向同步（检测外部变化）
<ReactFlow
  onMoveEnd={(_event, newViewport) => {
    canvasDataApi.writeFlow.setViewport(newViewport);
    syncFromReactFlow(); // 反向同步到 hook
  }}
  zoomOnScroll={false}  // 禁用默认滚轮缩放
  zoomOnPinch={false}
  zoomOnDoubleClick={false}
/>
```

### 与 3D 场景集成

```tsx
// Scene3D 组件接收 onOrbitControlsReady 回调
<Scene3D 
  sceneScale={sceneScale} 
  onOrbitControlsReady={setOrbitControls}
>
  {/* children */}
</Scene3D>

// Scene3D 内部
function CameraController({ onOrbitControlsReady }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  
  useEffect(() => {
    if (controlsRef.current && onOrbitControlsReady) {
      onOrbitControlsReady(controlsRef.current);
    }
  }, [onOrbitControlsReady]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}      // 禁用平移，由 hook 接管
      enableZoom={false}     // 禁用缩放，由 hook 接管
      enableRotate={true}    // 保留右键旋转
      // ...
    />
  );
}
```

## 配置选项

```tsx
interface PanAndZoomControlOptions {
  initialViewport?: Viewport;    // 初始 viewport，默认 {x:0, y:0, zoom:1}
  minZoom?: number;              // 最小缩放，默认 0.1
  maxZoom?: number;              // 最大缩放，默认 3
  zoomSpeed?: number;            // 滚轮缩放速度，默认 0.001
  panAcceleration?: number;      // 键盘平移加速度，默认 2
  panMaxSpeed?: number;          // 键盘平移最大速度，默认 10
  scenePanSensitivity?: number;  // 3D 平移灵敏度，默认 0.05
}
```

## 键盘控制

| 按键 | 功能 |
|------|------|
| `W` / `↑` | 向上平移 |
| `S` / `↓` | 向下平移 |
| `A` / `←` | 向左平移 |
| `D` / `→` | 向右平移 |
| 滚轮向上 | 放大 |
| 滚轮向下 | 缩小 |

## 3D 场景同步原理

### 缩放同步
- 2D zoom 值直接映射到 3D 场景的元素缩放
- `sceneScale = zoom`
- 3D 背景元素（菱形、星星）与 2D 内容同步缩放

### 平移同步
- 2D viewport x,y 映射到 OrbitControls 的 target
- 计算方式：`targetX = -x * sensitivity / zoom`
- 这样实现 2D 画布移动时，3D 相机跟随移动的效果

### 顺序问题
**先缩放，后移动**：
- viewport x,y 是绝对像素值，已经考虑了缩放
- 3D target 计算时需要除以 zoom，保持视觉一致性

## 测试方法

### 手动测试
1. 启动开发服务器：`npm run dev`
2. 打开浏览器访问页面
3. 测试滚轮缩放
4. 测试 WASD 键盘平移
5. 测试右键旋转 3D 场景
6. 观察右下角调试信息：Zoom 和 Pos 值

### 自动化测试（OBS 录屏）

```bash
cd r3f-reactflow-nextui/scripts/examples
node test-pan-zoom-control.cjs
```

测试脚本包含：
- 滚轮放大/缩小
- WASD 键盘平移
- 组合操作

## 注意事项

1. **事件冲突**：确保 ReactFlow 禁用默认滚轮缩放 (`zoomOnScroll={false}`)
2. **性能优化**：viewport 同步使用阈值判断，避免不必要的重渲染
3. **3D 旋转独立**：OrbitControls 只保留旋转功能，其他由 hook 接管
4. **文本编辑状态**：当用户编辑文本时，滚轮缩放会自动禁用

## 调试信息

页面右下角显示当前相机状态：
```
Zoom: 1.00x | Pos: (0, 0)
```

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     usePanAndZoomControl                     │
│                      (单一数据源)                             │
│                     viewport {x,y,zoom}                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
       ▼                       ▼
┌─────────────┐       ┌─────────────────┐
│  ReactFlow  │       │   3D Scene      │
│  (2D 画布)   │       │  (Three.js)     │
│             │       │                 │
│ setViewport │       │ setScale(zoom)  │
│ onMoveEnd   │──────▶│ target.x/y      │
│  (反向同步)  │       │  (OrbitControls)│
└─────────────┘       └─────────────────┘
```
