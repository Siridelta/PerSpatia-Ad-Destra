# 方案一：Cursor IDE Browser MCP

**状态**：✅ 稳定可用  
**适用场景**：前端调试、截图验证、交互测试  
**限制**：❌ 不支持录屏

---

## 简介

Cursor IDE 内置的浏览器 MCP 服务器，无需额外安装，可直接在 AI 对话中调用。

---

## 关键结论

**Browser-use subagent 在某些地区不可用，但 cursor-ide-browser MCP 服务器可用！** 直接使用 MCP 工具，无需 subagent。

---

## 检查 MCP 服务器

```powershell
# 查看可用的 MCP 工具描述符
ls "C:\Users\$env:USERNAME\.cursor\projects\$project-name\mcps\cursor-ide-browser\tools"
```

---

## 可用工具

| 工具名 | 用途 |
|--------|------|
| `browser_navigate` | 导航到 URL |
| `browser_reload` | 刷新页面 |
| `browser_take_screenshot` | 截图 |
| `browser_snapshot` | 获取页面结构和元素 refs |
| `browser_click` | 点击元素 |
| `browser_type` | 输入文本 |
| `browser_scroll` | 滚动页面 |
| `browser_console_messages` | 查看控制台日志 |
| `browser_network_requests` | 查看网络请求 |
| `browser_tabs` | 管理标签页 |
| `browser_lock/unlock` | 锁定/解锁浏览器控制权 |

---

## 使用示例

```typescript
// 导航到页面
CallMcpTool({
  server: "cursor-ide-browser",
  toolName: "browser_navigate",
  arguments: { url: "http://localhost:5173" }
})

// 截图验证
CallMcpTool({
  server: "cursor-ide-browser",
  toolName: "browser_take_screenshot",
  arguments: {}
})

// 获取页面快照（查看可交互元素）
CallMcpTool({
  server: "cursor-ide-browser",
  toolName: "browser_snapshot",
  arguments: {}
})

// 查看控制台消息
CallMcpTool({
  server: "cursor-ide-browser",
  toolName: "browser_console_messages",
  arguments: {}
})
```

---

## 调试流程

1. **导航** → `browser_navigate`
2. **检查控制台错误** → `browser_console_messages`
3. **截图确认渲染** → `browser_take_screenshot`
4. **获取页面结构** → `browser_snapshot`
5. **交互测试** → `browser_click` / `browser_type` 等

---

## 重要注意事项

- **不要**使用 `browser-use` subagent（地区受限）
- **直接**使用 `cursor-ide-browser` MCP 工具
- 截图保存路径：`C:\Users\$env:USERNAME\AppData\Local\Temp\cursor\screenshots\`
- 浏览器操作需要开发服务器已启动

---

## 常见错误处理

```
Error: Model not available - browser-use subagent 不可用时
解决方案：直接使用 cursor-ide-browser MCP，无需 subagent
```

```
Error: Tool cursor-ide-browser-xxx was not found
解决方案：检查 tools 目录下的 .json 文件确认工具名
```

---

## 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 内置，无需配置 | ❌ 不支持录屏 |
| ✅ 可在 AI 对话中直接使用 | ❌ 无法执行 JavaScript |
| ✅ 截图方便 | ❌ 只能模拟交互 |

---

## 适用场景

- 前端调试和截图验证
- 检查页面渲染状态
- 查看控制台错误
- 简单交互测试

---

[← 返回总览](./recording-solutions.md)
