/**
 * 缩放功能录屏测试 - Playwright 内置录屏版
 * 使用 Screencaster 模块录制 zoom in/out 操作
 */

const { record, zoom } = require('../core/screencaster.cjs');

(async () => {
  try {
    await record({
      outputDir: '../../assets',
      filename: 'zoom-test.mp4',
      url: 'http://localhost:5173',
      viewport: { width: 1920, height: 1080 },
      preDelay: 3000,
      postDelay: 1000,

      action: async (page) => {
        console.log('Zooming in...');
        await zoom(page, 5, -100, 500);

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
