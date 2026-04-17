# PerSpatia 基础架构 (Infrastructure)

本文记录项目的基础设施决策。

---

## 1. 路由方案 (Routing)

### 1.1 HashRouter
*   **决策**：全面采用 `HashRouter` 而非 `BrowserRouter`。
*   **理由**：
    *   **环境适配**：适配 `live-server`、GitHub Pages 等静态托管环境，确保在没有后端重写规则的情况下，移动端刷新页面不丢失路径。
    *   **快速迭代**：在开发变体（Variants）时，Hash 路由能更简单地通过 URL 共享特定场景。
