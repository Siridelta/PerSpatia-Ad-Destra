# 坐标空间转换推导 (Coordinates Transform)

### 1. React Flow Viewport 坐标与缩放含义

React Flow Viewport 参数 `{vp.xy, vp.zoom}` 的含义是让某个画布坐标 `rfPos` 通过以下关系映射到屏幕坐标 `screenPos`：

```
  screenPos = vp.xy + rfPos * vp.zoom
```

这个公式其实相当反直觉，但 React Flow 就是这么难绷（（

我们实际上需要设置 React Flow 的（CSS Transform 前的）尺寸一定程度上大于 window 尺寸，因为如果不扩大的话侧视时会导致画布无法完全覆盖视野。我们的方案是将相机（绕注视点）摆动的范围限制在以 $Z+$ 方向为中心的一个锥体范围内——与 $Z+$ 轴的夹角限制为不能超过一个限值 `alpha`。

因此我们需要适度扩张 React Flow 尺寸。如果 window height 为 `vh`，那么 React Flow 的 height 需要扩张到 `standard_z * 100 * tan(fov / 2 + alpha)`。

若我们将扩张因子记作 `expans`：

```
  expans = tan(fov / 2 + alpha) / tan(fov / 2)
```

那么我们需要保证将 React Flow DOM 尺寸缩放 `expans` 倍（保持以屏幕中心为中心），然后 `screenPos` 的实际映射公式将会变成：

```
  screenPos = vp.xy + rfPos * vp.zoom - (vw / 2, vh / 2) * (expans - 1)
```

> **注（关于偏航的疏忽）**：这里的 `expans` 系数推导仅基于 20 度锥体的 **Base Rotation**（用户控制量），并没有考虑到由于平移速度产生的 **Drift Rotation**（动态偏航）。这是为了避免坐标映射逻辑变得过于复杂而做的工程简化。考虑到偏航角通常极小且是暂态的，这一简化在视觉上（应该？）是可接受的。

---

### 2. 三维场景的映射关系

对于我们的三维场景，我们将 3D 坐标 `threePos` (仅含 XY) 映射到屏幕空间 `screenPos` 的近似关系是：

```
  camZoom = some_standard_z / cam.z

  screenPos = [1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2)
```

（`some_standard_z` 可以留到最后再确定，它决定了 RF 坐标系 and Three 坐标系之间的一个对应缩放因子。）

（一般 Three 场景里事物的尺寸在 1 个单位量级，但使用标准像素的 DOM 元素尺寸一般在 100 左右的量级，因此乘以一个 100 对应，在代码里记为 `SCREEN_METRIC_TO_THREE = 100`。）

---

### 3. 映射一致性推导

我们如果要通过 3D 场景相机推算 React Flow Viewport 参数，我们需要保证上面这两个映射——从 `rfPos` 到 `screenPos`，和从 `threePos` 到 `screenPos` 的这两个映射，一定程度上是**一致**的。

更严谨的说，对于一个确定的 `threePos`，一定有一个唯一确定的 `rfPos`。若认为有从 `threePos` 到 `rfPos` 的映射，那么保持两个坐标映射一致，就是：

```
  ff_three_screen(cam)(threePos) = ff_rf_screen(vp)(f_three_rf(threePos))
```

其中：

```
  camZoom(cam) = some_standard_z / cam.z

  ff_three_screen = (cam) => (threePos) => [1, 0; 0, -1] * (threePos - cam.xy) * camZoom(cam) * 100 + (vw / 2, vh / 2)

  ff_rf_screen = (vp) => (rfPos) => vp.xy + rfPos * vp.zoom - (vw / 2, vh / 2) * (expans - 1)
```

而 `f_three_rf` 是 `threePos` 到 `rfPos` 的映射，我们暂时不知道，但是独立于 `cam` 和 `vp`。因此我们需要找到 `f_three_rf` 和 `f_cam_vp`，使得：

```
  ff_three_screen(cam)(threePos) = ff_rf_screen(f_cam_vp(cam))(f_three_rf(threePos))
```

---

### 4. 系数确定路径

需要找到 `f_three_rf` 和 `f_cam_vp` 满足，对于任意的 `cam` 和 `threePos`：

```
  vp = f_cam_vp(cam)

  rfPos = f_three_rf(threePos)

  [1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2) = vp.xy + rfPos * vp.zoom - (vw / 2, vh / 2) * (expans - 1)
```

推断 `rfPos` 和 `threePos` 的关系：

```
  rfPos = [[1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2) * expans - vp.xy] / vp.zoom
```

然而理想状态下 `rfPos = f_three_rf(threePos)` 应该是一个跟 `cam` 和 `vp` 无关的函数，因此对于上式的系数我们可以确定：

**一次项对比：**

```
  rfPos = [1, 0; 0, -1] * camZoom * 100 / vp.zoom * threePos + ...

  camZoom = vp.zoom 即 vp.zoom = some_standard_z / cam.z
```

**常数项对比：**

```
  rfPos = ... * threePos - [1, 0; 0, -1] * cam.xy * 100 + [(vw / 2, vh / 2) * expans - vp.xy] / vp.zoom

  -[1, 0; 0, -1] * cam.xy * 100 + [(vw / 2, vh / 2) * expans - vp.xy] / vp.zoom = const
```

由 `vp.zoom = some_standard_z / cam.z` 得到由 `cam` 算出 `vp` 的表达式：

```
  vp.xy = (vw / 2, vh / 2) * expans - [1, 0; 0, -1] * cam.xy * 100 * (some_standard_z / cam.z) - const * vp.zoom

  令 const 为 0 => vp.xy = [-1, 0; 0, 1] * cam.xy * 100 * (some_standard_z / cam.z) + (vw / 2, vh / 2) * expans
```

> **注（关于 const = 0 的物理含义）**：在推导过程中令 `const = 0` 是为了确立两个坐标系的**对齐基准**。它物理上意味着：当相机位于 `(0,0,z)` 正视原点时，React Flow 画布的 `(0,0)` 坐标恰好映射到屏幕中心点。

再求得 `rfPos` 的表达式：

```
  rfPos = [1, 0; 0, -1] * threePos * 100
```

---

### 5. 总结与实现

**最终转换函数：**

```
  f_three_rf = (threePos) => [1, 0; 0, -1] * threePos * 100

  f_cam_vp = (cam) => { zoom: some_standard_z / cam.z, xy: [-1, 0; 0, 1] * cam.xy * 100 * .zoom + (vw / 2, vh / 2) * expans }
```

**Standard Z 的确定：**

我们需要把相机放在一个足够自然的 $Z$ 位置上，使得默认视角下，3D 相机的视野恰好覆盖 `window / 100` 的量级：

```
  standard_z = vh / 100 / tan(fov / 2)
```

#### 核心公式速查 (Implementation)

```typescript
// 1. 预计算常量
const expans = Math.tan(fov/2 + alpha) / Math.tan(fov/2);
const standard_z = vh / 100 / Math.tan(fov/2);

// 2. 相机 Store -> React Flow Viewport 同步逻辑
const vp_zoom = standard_z / cam.z;
const vp_x = -cam.x * 100 * vp_zoom + (vw / 2) * expans;
const vp_y =  cam.y * 100 * vp_zoom + (vh / 2) * expans;
```
