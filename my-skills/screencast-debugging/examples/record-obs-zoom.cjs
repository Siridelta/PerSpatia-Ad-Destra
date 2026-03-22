/**
 * OBS 录屏示例：缩放测试
 * 使用 obs-screencaster 模块，只需关注操作逻辑
 */

const { record, zoom } = require('../core/obs-screencaster.cjs');

(async () => {
  try {
    await record({
      // OBS 配置
      obsAddress: 'ws://localhost:4455',
      obsPassword: '',

      // 浏览器配置
      cdpUrl: 'http://localhost:9222',
      url: 'http://localhost:5173',

      // 录制参数
      preDelay: 3000,
      postDelay: 1000,

      // 核心操作：只操作 page，OBS 自动录制
      action: async (page) => {
        console.log('Zooming in...');
        await zoom(page, 5, -100, 500);

        await page.waitForTimeout(500);

        console.log('Zooming out...');
        await zoom(page, 5, 100, 500);
      }
    });

    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
