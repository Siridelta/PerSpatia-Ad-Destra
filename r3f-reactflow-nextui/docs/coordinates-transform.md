

关于 Reactflow viewport 坐标和缩放含义：

Reactfow viewport 参数 {vp.xy, vp.zoom} 的含义是让某个 Reactflow 画布坐标系的坐标 rfPos 通过以下关系映射到屏幕坐标 screenPos：

  screenPos = vp.xy + rfPos * vp.zoom;

这个公式其实相当反直觉，但 reactflow 就是这么难绷（（

---

而对于我们的三维场景，我们将 3d 坐标 threePos (仅含xy) 映射到屏幕空间 screenPos 的近似关系是：

  cam.xyz: 相机 xyz 坐标；

  vw, vh: 窗口宽高；

  camZoom = some_standard_z / cam.z;

  screenPos = [1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2);

（some_standard_z 可以留到最后再确定，它决定了 rf 坐标系和 three 坐标系之间的一个对应缩放因子，一个 three 坐标大致对应多少的 rf 坐标。）

（一般 three 场景里事物的尺寸在 1 个单位量级，但使用标准像素的 DOM 元素尺寸一般在 100 左右的量级，因此乘以一个 100 对应，在代码里记为 SCREEN_METRIC_TO_THREE_METRIC = 100）

---

所以我们如果要通过 3d scene camera 推算 reactflow viewport 参数，我们需要保证上面这两个映射

——从 rfPos 到 screenPos，和从 threePos 到 screenPos 的（一定程度上线性的）这两个映射，一定程度上是**一致**的。

更严谨的说，对于一个确定的 threePos，一定有一个唯一确定的 rfPos，所以若认为有从 threePos 到 rfPos 的映射，

那么我们刚才说的保持两个坐标映射一致，就是

ff_three_screen(cam)(threePos) = ff_rf_screen(vp)(f_three_rf(threePos))

其中

  camZoom(cam) = some_standard_z / cam.z;

  ff_three_screen = (cam) => (threePos) => [1, 0; 0, -1] * (threePos - cam.xy) * camZoom(cam) * 100 + (vw / 2, vh / 2)

  ff_rf_screen = (vp) => (rfPos) => vp.xy + rfPos * vp.zoom

  而 f_three_rf 是 threePos 到 rfPos 的映射，我们暂时不知道，但是独立于 cam 和 vp.

因此我们需要找到 f_three_rf 和 f_cam_vp，使得

  ff_three_screen(cam)(threePos) = ff_rf_screen(f_cam_vp(cam))(f_three_rf(threePos))

---

整理一下表述，

需要找到 f_three_rf 和 f_cam_vp 满足，对于任意的 cam 和 threePos:

  vp = f_cam_vp(cam);

  rfPos = f_three_rf(threePos);

  camZoom = some_standard_z / cam.z;

  [1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2) = vp.xy + rfPos * vp.zoom

  推断 rfPos 和 threePos 的关系：

    rfPos = [[1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2) - vp.xy] / vp.zoom

  然而 rfPos = f_three_rf(threePos) 与 cam 和 vp 无关，因此对于上式的系数我们可以确定：

    threePos 项: [1, 0; 0, -1] * camZoom * 100 / vp.zoom = const

       --- 不妨令 rfPos = 100 * [...] * threePos + ...，
       
       因此 camZoom = vp.zoom，也就是 vp.zoom = some_standard_z / cam.z;
    
    常项: -[1, 0; 0, -1] * cam.xy * 100 + [(vw / 2, vh / 2) - vp.xy] / vp.zoom = const

    vp.zoom = some_standard_z / cam.z，因此可以得到由 cam 算出 vp 的表达式：

    vp.xy = const + (vw / 2, vh / 2) - [1, 0; 0, -1] * cam.xy * (some_standard_z / cam.z) 

    令 const 为 0 也就是

    vp.xy = [-1, 0; 0, 1] * cam.xy * (some_standard_z / cam.z) + (vw / 2, vh / 2)

  再求得 rfPos 的表达式：

    rfPos = [[1, 0; 0, -1] * (threePos - cam.xy) * camZoom * 100 + (vw / 2, vh / 2) - vp.xy] / vp.zoom

      = [1, 0; 0, -1] * (threePos - cam.xy) * 100 + [(vw / 2, vh / 2) - vp.xy] / vp.zoom

      = [1, 0; 0, -1] * (threePos - cam.xy) * 100 + [(vw / 2, vh / 2) - (vw / 2, vh / 2) + [1, 0; 0, -1] * cam.xy * (some_standard_z / cam.z)] / vp.zoom

      = [1, 0; 0, -1] * threePos * 100
    
因此我们求得：

  f_three_rf = (threePos) => [1, 0; 0, -1] * threePos * 100

  f_cam_vp = (cam) => {
    zoom: some_standard_z / cam.z
    xy: [-1, 0; 0, 1] * cam.xy * .zoom + (vw / 2, vh / 2)
  }

---

怎么确定 standard z? 我们需要把相机放在一个足够自然的 z 位置上，使得如果我们规定这个视角下的“默认” 3d 场景即对应于这个公式算出来的 viewport 下的“默认” reactflow 场景，

那么这个要求对 three 世界和 reactflow 世界而言都是足够自然的。

默认 React flow 场景是相机视野包括 window width 和 height 的场景，而默认的 three 场景是相机视野包括......多大范围？

不妨令 three 场景里相机视野就包括 window width / 100 和 window height / 100 的范围，

所以 standard_z = vh / 100 / tan(fov / 2). (fov 是用垂直方向定义的)

---

但是：实际上从之前到现在的推导过程一直忽略了一个问题，我们实际上不能设置 reactflow 的（css transform 前的）尺寸为 window 尺寸，因为这样的话侧视会导致 reactflow 无法完全覆盖视野。

我们的方案是将相机（绕注视点）摆动的范围限制在以 z+ 方向为中心的一个锥体范围内——与 z+ 轴的夹角限制为不能超过一个限值 alpha。

因此我们需要适度扩张 reactflow 尺寸...... 如果 window height 为 h，那么 reactflow 的 height 需要扩张到 standard_z * 100 * tan(fov / 2 + alpha).

这个扩张会影响我们前面所算的 cam <-> vp 换算公式...... 但是其实可以比较简单地处理这个问题：

若我们将扩张因子记作 expans = tan(fov / 2 + alpha) / tan(fov / 2)，那么我们只需要保证将 reactflow DOM 尺寸缩放 expanse 倍（保持以屏幕中心为中心），然后在 viewport 上将 expans 作为额外的 zoom out 因子叠加到原本的 zoom 上即可，像这样：

  f_cam_vp = (cam) => {
    zoom: standard_z / cam.z / expans
    xy: [-1, 0; 0, 1] * cam.xy * .zoom + (vw / 2, vh / 2)
  }

