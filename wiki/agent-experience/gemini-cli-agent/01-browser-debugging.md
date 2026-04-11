# Gemini CLI Agent 浏览器调试经验

**状态**：✅ 稳定（2026-03-27 验证）  
**适用场景**：在终端通过 Gemini CLI 进行前端 UI 调试、3D 场景观测和截图验证。

---

## 1. 核心工具选型 (Tooling Strategy)

在 Gemini CLI 环境下，根据连接模式选择工具：

| 模式 | 推荐工具 | 理由 |
|------|----------|------|
| **远程调试 (CDP 9223/9222)** | `mcp_io.github.ChromeDevTools_c...e-devtools-mcp_take_screenshot` | **唯一能看到用户实时操作页面的工具**。虽然名字被截断，但必须使用。 |
| **独立沙盒调试** | `mcp_microsoft_playwright-mcp_browser_take_screenshot` | 稳定，但它是在 Agent 自己的隔离环境中运行，看不到用户当前浏览器。 |
| **布局分析 (文本)** | `mcp_io.github.ChromeDevTools_chrome-devtools-mcp_take_snapshot` | 极其节省 Token，且能读出 3D 相机参数的文本显示。 |

---

## 2. 坑点记录 (Caveats)

### 2.1 工具名截断 Bug（重要）
**现象**：`chrome-devtools-mcp` 的某些工具名在 Gemini CLI 中显示为 `...e-devtools-mcp_take_screenshot`。  
**结论**：**这不仅是显示 Bug，调用时也必须带上省略号字面量。** 
- ❌ 错误：调用 `take_screenshot` (会报 Not Found)
- ✅ 正确：直接复制 `available_tools` 列表里的带 `...` 的完整字符串进行调用。

### 2.2 实时性差异
- **CDP 工具**：直接连接用户打开的窗口，适合 UI 调试。
- **Playwright 工具**：适合做自动化脚本测试，但默认不共享 Session。

### 2.2 端口探测
**现象**：用户可能同时开启多个子工程（如 5173 对应 r3f, 5174 对应旧版）。  
**对策**：在开始调试前，优先调用 `list_pages` 确认当前活跃的 Tab URL，避免截错页面。

---

## 3. 3D 场景调试技巧 (R3F Special)

对于 `r3f-reactflow-nextui` 这类 3D 项目：
1. **数值胜过视觉**：通过 `take_snapshot` 获取页面底部的 Debug HUD（相机状态），直接读取 θ、φ、radius 的精确值，比看截图分析倾角更高效。
2. **多模态联动**：先拿 `snapshot` 确认坐标，再拿 `screenshot` 确认视觉渲染（如 Shader 效果、颜色节奏）。

---

## 4. 最佳实践流程

1. `list_pages` -> 确认目标 Tab。
2. `select_page` -> 激活目标。
3. `take_snapshot` -> 快速同步状态、阅读报错、读取相机 HUD。
4. `playwright_take_screenshot` -> 视觉结果确认。

---

[← 返回总览](../README.md)
