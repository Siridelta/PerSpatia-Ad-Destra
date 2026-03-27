# 录屏方案总览

项目提供四种录屏/浏览器自动化方案，各有适用场景。

---

## 快速选择

| 需求 | 推荐方案 | 文档 |
|------|----------|------|
| 截图/调试/简单交互 | **方案一** Cursor Browser MCP | [查看详情](./recording-cursor-mcp.md) |
| 立即录制视频（备用） | **方案三** Playwright 内置录屏 | [查看详情](./recording-playwright.md) |
| **高质量录主窗口** ⭐ | **方案四** OBS WebSocket | [查看详情](./recording-obs.md) |
| 等官方修复 | **方案二** Chrome MCP（不推荐） | [查看详情](./recording-chrome-mcp.md) |

---

## 方案对比

| 特性 | 方案一 | 方案二 | 方案三 | 方案四 |
|------|--------|--------|--------|--------|
| 名称 | Cursor MCP | Chrome MCP | Playwright | OBS |
| 稳定性 | ✅ 好 | ❌ 差 | ✅ 好 | ✅ 好 |
| 录屏支持 | ❌ 无 | ⚠️ 不稳定 | ✅ 支持 | ✅ 最佳 |
| 视频质量 | - | ⚠️ 中 | ⚠️ 中 | ✅ 高（硬件编码） |
| 窗口问题 | ✅ 无 | - | ❌ 新窗口 | ✅ **主窗口** |
| 额外软件 | 无 | 无 | 无 | 需运行 OBS |

---

## 使用场景总结

- **开发调试** → 方案一（Cursor MCP，截图方便）
- **快速录演示** → 方案三（Playwright，开箱即用）
- **高质量宣传片** → 方案四（OBS，硬件编码，录主窗口）

---

## 脚本目录结构

```
scripts/
├── core/                    # 核心模块
│   ├── obs-screencaster.cjs  # OBS一体化录屏（推荐）
│   ├── obs-controller.cjs    # OBS底层控制
│   └── screencaster.cjs      # Playwright内置录屏
├── examples/               # 示例
│   ├── record-obs-zoom.cjs     # OBS简化示例
│   ├── record-obs-advanced.cjs # OBS高级示例
│   ├── record-pan-test.cjs     # Playwright示例
│   └── record-zoom-test.cjs    # Playwright示例
└── templates/              # 模板
    ├── obs-record-template.cjs   # OBS模板（推荐）
    └── record-template.cjs       # Playwright模板
```

---

## 快速开始

### OBS 方案（推荐）

```powershell
# 1. 配置 OBS：工具 → WebSocket服务器 → 启用 → 端口4455
# 2. 设置录制场景：来源 → 显示捕获 → 覆盖浏览器窗口
# 3. 复制模板创建新任务
cd scripts
cp templates/obs-record-template.cjs examples/my-test.cjs

# 4. 编辑 examples/my-test.cjs，修改 action 函数
# 5. 运行
node examples/my-test.cjs
```

详细文档：[recording-obs.md](./recording-obs.md)

### Playwright 方案（备用）

```powershell
cp templates/record-template.cjs examples/my-test.cjs
node examples/my-test.cjs
```

详细文档：[recording-playwright.md](./recording-playwright.md)
