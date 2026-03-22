/**
 * 录屏任务模板 - Playwright 内置录屏版
 * 复制此文件并重命名，然后修改 action 函数即可创建新录屏任务
 */

const { record, zoom, pan, clickElement } = require('../core/screencaster.cjs');

(async () => {
  try {
    await record({
      // === 配置选项 ===
      outputDir: '../../assets',                    // 视频输出目录
      filename: 'your-test-name.mp4',              // 视频文件名
      url: 'http://localhost:5173',                // 要录制的页面
      viewport: { width: 1920, height: 1080 },     // 视口大小
      preDelay: 3000,                              // 页面加载后等待（毫秒）
      postDelay: 1000,                             // 操作完成后等待（毫秒）

      // === 自定义操作 ===
      action: async (page) => {
        // 在这里写你的操作逻辑
        // 可用工具：
        // - await zoom(page, steps, deltaY, delay)    - 滚轮缩放
        // - await pan(page, deltaX, deltaY, duration) - 拖拽平移
        // - await clickElement(page, selector, delay) - 点击元素
        // - await page.mouse.move(x, y)               - 移动鼠标
        // - await page.mouse.down() / up()            - 鼠标按下/释放
        // - await page.click(selector)                - 点击选择器
        // - await page.waitForTimeout(ms)             - 等待
        // - ... 更多 Playwright API

        // 示例：缩放到节点
        console.log('Zooming to nodes...');
        await zoom(page, 5, -100, 500);

        // 示例：点击某个按钮
        // console.log('Clicking button...');
        // await clickElement(page, '[data-testid="my-button"]');
      }
    });

    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
