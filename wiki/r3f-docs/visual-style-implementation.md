# 视觉风格实现 (Visual Style Implementation)

本文记录 PerSpatia 视觉风格的具体技术实现细节，包括字体驱动与节点视觉规范。

---

## 1. 字体系统 (Font System)

### 1.1 可变字体驱动 (Variable Fonts)
*   **方案**：使用 `CSS Variables` 动态控制可变字体的轴参数。
*   **核心变量**：
    *   `--spatial-font-family`: 默认 Cascadia Code Variable。
    *   `--spatial-font-weight`: 范围 100-800，用于传达信息的密度感。
*   **强制属性**：必须在 CSS 中显式声明 `font-variation-settings: "wght" var(--spatial-font-weight)` 才能确保字重调节对 Web 字体生效。

---

## 2. 节点视觉规范 (The Floating Node)

### 2.1 去实体化 (De-materialization)
*   **视觉逻辑**：节点根容器禁用 `background`, `border`, `box-shadow`。节点应像悬浮在空中的全息图。
*   **实现**：节点背景透明，不使用封闭边框，利用内部元素界定边界。

### 2.2 调节边界与装饰
*   **调节控件**：`NodeResizeControl` 保持透明且覆盖全高度。
*   **视觉引导**：使用发光的细线（如内部的 `node-decor-line`）来暗示结构，而非封闭的方框，增强“理科科幻”的悬浮感。
