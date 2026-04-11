/**
 * Test 1: 仅测试滚轮缩放
 */
const { record, zoom } = require('../core/obs-screencaster.cjs');
const path = require('path');

async function testZoomOnly() {
  const assetsDir = path.resolve(__dirname, '../../../assets');

  await record({
    obsAddress: 'ws://localhost:4455',
    obsPassword: '',
    cdpUrl: 'http://localhost:9222',
    url: 'http://localhost:5173',
    useExistingPage: true,
    preDelay: 3000,
    postDelay: 2000,
    outputDir: assetsDir,
    action: async (page) => {
      console.log('[Test] Reloading page...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      // 点击获取焦点
      await page.click('body');
      await page.waitForTimeout(500);
      
      console.log('[Test] Testing zoom in...');
      await zoom(page, 2, -50, 300);  // 2步×50，更温和的缩放
      await page.waitForTimeout(1000);
      
      console.log('[Test] Testing zoom out...');
      await zoom(page, 2, 50, 300);
      await page.waitForTimeout(1000);
      
      console.log('[Test] Testing zoom in again...');
      await zoom(page, 2, -50, 300);
      await page.waitForTimeout(1000);
      
      console.log('[Test] Zoom test completed!');
    }
  });
}

testZoomOnly()
  .then(() => {
    console.log('[Test] Recording completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Test] Recording failed:', error);
    process.exit(1);
  });
