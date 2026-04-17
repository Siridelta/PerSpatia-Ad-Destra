# 移动端适配笔记 (Mobile Adaptation Notes)

为了让 PerSpatia 在移动端也能进行预览和基础交互，我们需要记录并处理一些移动端特有的适配问题。

## 1. 路由方案 (Routing)
- **HashRouter**：为了更好地适配 `live-server` 等静态服务器，已全面切换为 **`HashRouter`**。现在 URL 格式为 `/#/v1`，刷新页面时路径不会丢失。

## 2. 交互手势冲突与 OS 拦截 (Gesture Conflicts)
- **核心痛点**：iOS 和部分安卓系统会拦截“原生三指下滑/捏合”等手势。
- **终极解决方案**：**强烈建议用户在手机设置中搜索“截屏”或“手势”，关闭所有与“三指”或“多指”相关的系统快捷操作**。
- **备选方案**：若无法关闭系统手势，可尝试“先放双指，再落第三指”的顺序操作，以此绕过 OS 手势识别。
- **技术保底**：我们在 `CameraControl` 中使用了 **Capture 阶段 (onPointerDownCapture)** 拦截。只要检测到 >= 2 根手指，立刻强制接管并停止冒泡，防止误触节点。
- **防滑脱 (Pointer Capture)**：在 `pointerdown` 时必须调用 `el.setPointerCapture(id)`，否则手指滑出视口会导致触点字典状态卡死。

## 3. 开发工作流 (Workflow)
- **推荐方案**：运行 `vite build --watch` 并在另一个终端运行 `live-server` 托管 `dist` 文件夹。
- **优点**：手机加载极快，且保存代码后 1-2 秒即自动刷新。

*(随着开发深入，继续在此补充)*
