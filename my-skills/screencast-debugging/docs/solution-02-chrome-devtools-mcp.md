# 方案二：Chrome DevTools MCP（第三方）

**状态**：❌ 不稳定，已放弃  
**适用场景**：无（暂不可用）  
**问题**：录屏功能导致连接崩溃

---

## 简介

第三方 MCP 服务器，通过 Chrome DevTools Protocol 连接浏览器。

---

## 配置

在 `~/.cursor/mcp.json` 中添加：

```json
{
    "mcpServers": {
        "chrome-devtools": {
            "command": "powershell",
            "args": [
                "-c", "npx", "chrome-devtools-mcp@latest",
                "-u", "http://127.0.0.1:9222",
                "--experimentalScreencast"
            ]
        }
    }
}
```

---

## 问题记录

| 功能 | 状态 | 问题 |
|------|------|------|
| `list_pages` | ✅ 可用 | 稳定 |
| `navigate_page` | ✅ 可用 | 稳定 |
| `take_screenshot` | ✅ 可用 | 稳定 |
| `evaluate_script` | ✅ 可用 | 稳定 |
| `screencast_start` | ❌ 崩溃 | 触发后 MCP 服务器断开 |
| `screencast_stop` | ❌ 崩溃 | 无法调用 |

**测试结果**：
- 即使单独调用 `screencast_start`（不执行脚本），也会触发 EOF 错误
- MCP 服务器崩溃后需重启

---

## 教训

- 新功能（12天前刚发布）等稳定了再用
- 找替代方案时不要浪费时间在明显不稳定的功能上

---

## 替代方案

- 录屏：使用方案三（Playwright）或方案四（OBS）
- 调试：使用方案一（Cursor Browser MCP）

---

[← 返回总览](./recording-solutions.md)
