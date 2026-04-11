/**
 * 拖拽（平移）功能录屏测试
 * 使用 Screencaster 模块录制 canvas 拖拽操作
 */

const { record, zoom, pan } = require('../core/screencaster.cjs');

(async () => {
  try {
    await record({
      outputDir: '../../assets',
      filename: 'pan-test.mp4',
      url: 'http://localhost:5173',
      viewport: { width: 1920, height: 1080 },
      preDelay: 3000,
      postDelay: 500,
      
      action: async (page) => {
        // 先放大一点，看得更清楚
        console.log('Zooming in slightly...');
        await zoom(page, 3, -100, 300);
        await page.waitForTimeout(500);
        
        // 向右拖拽
        console.log('Panning right...');
        await pan(page, 400, 0, 1500);
        await page.waitForTimeout(500);
        
        // 向左拖拽回来
        console.log('Panning left...');
        await pan(page, -400, 0, 1500);
        await page.waitForTimeout(500);
        
        // 向下拖拽
        console.log('Panning down...');
        await pan(page, 0, 300, 1500);
        await page.waitForTimeout(500);
        
        // 向上拖拽回来
        console.log('Panning up...');
        await pan(page, 0, -300, 1500);
      }
    });
    
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
