# r3f-reactflow-nextui 实现文档 (Core Implementation)

本目录记录了 PerSpatia 核心 3D 渲染与交互层的技术实现相关信息。

## 1. 核心交互与坐标系
- **[camera-control.md](./camera-control.md)**: 相机控制中枢。涵盖 WASD、多点触控拦截、**增量累加器**模型、模拟相机领先帧及惯性接续逻辑。
- **[coordinates-transform.md](./coordinates-transform.md)**: 空间投影数学。记录了如何将 3D 相机姿态精准映射到 React Flow Viewport 的**全量推导过程**。

## 2. 视觉表现与风格
- **[per-spatia-visual-language.md](../per-spatia-visual-language.md)**: 视觉美学宣言（位于根目录）。定义了“暖色氛围场”与 DATA WING 谱系的设计意图。
- **[visual-style-implementation.md](./visual-style-implementation.md)**: 视觉落地细节。涵盖全局字体清理、视觉字重归一化以及 **R3F 多配色变体**的实现惯例。

## 3. 平台适配
- **[mobile-adaptation-notes.md](./mobile-adaptation-notes.md)**: 移动端适配的专项内容。记录了**全局多指手势**的实现、OS 级冲突规避技巧及已知局限。

---

## 历史归档
`archive/` 目录下存放历史设计文档（旧控制器方案等），仅供回溯参考，请勿按其实现新功能。
