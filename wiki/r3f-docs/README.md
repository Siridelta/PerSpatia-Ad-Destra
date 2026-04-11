# r3f-reactflow-nextui 文档

## 当前有效

- **[camera-architecture.md](./camera-architecture.md)** — **主文档**：实现梗概 → **数据流向与四层分工**（冒泡、`input` 与 `tick` 解耦、三路消费）→ 升维叙事 → SSOT、代码地图、公式、RF 禁忌与排错；并对照 `archive/`。以代码为准。
- **[per-spatia-visual-language.md](./per-spatia-visual-language.md)** — **产品与美学**：为何做 plane-on-3D、与 DATA WING 气质的参照、当前仍偏毛坯的诚实说明；**空间约定**（XY 竖墙、Y 竖直、Z 纵深、保持接近平视）及与 drei 默认控制器的错位说明。

## 归档（仅供参考）

`archive/` 下为**历史设计**（`usePanAndZoomControl`、OrbitControls 时代、旧文件结构说明等），**不要按这些文档实现新功能**，避免与当前 `cameraStore` 方案冲突。
