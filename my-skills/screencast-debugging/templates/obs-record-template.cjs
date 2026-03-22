/**
 * OBS 录屏任务模板
 * 复制此文件并重命名，然后修改 action 函数
 *
 * 前置条件：
 * 1. OBS 已启动，WebSocket 已启用（工具 → WebSocket 服务器设置）
 * 2. 配置好录制场景（显示捕获/窗口捕获）
 * 3. 浏览器以远程调试模式启动（--remote-debugging-port=9222）
 */

const { record, zoom, pan, click } = require('../core/obs-screencaster.cjs');

(async () => {
  try {
    await record({
      // === OBS 配置 ===
      obsAddress: 'ws://localhost:4455',  // OBS WebSocket 地址
      obsPassword: '',                    // 密码（如无留空）

      // === 浏览器配置 ===
      cdpUrl: 'http://localhost:9222',    // 浏览器 CDP 地址
      url: 'http://localhost:5173',       // 要录制的页面
      useExistingPage: true,              // true=使用已有页面，false=开新窗口

      // === 录制参数 ===
      preDelay: 3000,    // 页面加载后等待（毫秒）
      postDelay: 1000,   // 操作后等待（毫秒）
      viewport: { width: 1920, height: 1080 },  // 视口大小

      // === 自定义操作 ===
      // 只需操作 page，OBS 会自动录制整个过程
      action: async (page) => {
        // 可用工具：
        // - await zoom(page, steps, deltaY, delay)  - 滚轮缩放
        // - await pan(page, deltaX, deltaY, duration) - 拖拽平移
        // - await click(page, selector, delay)      - 点击元素
        // - Playwright 完整 API：page.click(), page.fill(), etc.

        // 示例：滚轮缩放
        console.log('Performing zoom...');
        await zoom(page, 5, -100, 500);
        await page.waitForTimeout(500);
        await zoom(page, 5, 100, 500);

        // 示例：点击元素
        // await click(page, '[data-id="node-1"]', 1000);

        // 示例：拖拽
        // await pan(page, 300, 0, 1500);
      }
    });

    console.log('Recording complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
