/**
 * Test script for usePanAndZoomControl
 * 
 * Tests:
 * 1. Mouse wheel zoom
 * 2. Keyboard pan (WASD)
 * 3. 3D scene sync
 * 
 * Usage:
 *   cd my-skills/screencast-debugging
 *   node examples/test-pan-zoom-control.cjs
 */

const { record, zoom, pan } = require('../core/obs-screencaster.cjs');

async function testPanAndZoomControl() {
  await record({
    // OBS 配置
    obsAddress: 'ws://localhost:4455',
    obsPassword: '',

    // 浏览器配置
    cdpUrl: 'http://localhost:9222',
    url: 'http://localhost:5174',
    useExistingPage: true,

    // 录制参数
    preDelay: 3000,
    postDelay: 2000,

    // 核心操作
    action: async (page) => {
      console.log('[Test] Starting usePanAndZoomControl tests...');
      
      // Test 1: 滚轮缩放（放大）
      console.log('[Test] Test 1: Wheel zoom in');
      await zoom(page, 5, -100, 300);
      await page.waitForTimeout(1000);
      
      // Test 2: 滚轮缩放（缩小）
      console.log('[Test] Test 2: Wheel zoom out');
      await zoom(page, 3, 150, 300);
      await page.waitForTimeout(1000);
      
      // Test 3: 键盘平移 - 向右 (D key)
      console.log('[Test] Test 3: Keyboard pan right (D key)');
      await page.keyboard.down('d');
      await page.waitForTimeout(1500);
      await page.keyboard.up('d');
      await page.waitForTimeout(500);
      
      // Test 4: 键盘平移 - 向左 (A key)
      console.log('[Test] Test 4: Keyboard pan left (A key)');
      await page.keyboard.down('a');
      await page.waitForTimeout(1500);
      await page.keyboard.up('a');
      await page.waitForTimeout(500);
      
      // Test 5: 键盘平移 - 向下 (S key)
      console.log('[Test] Test 5: Keyboard pan down (S key)');
      await page.keyboard.down('s');
      await page.waitForTimeout(1500);
      await page.keyboard.up('s');
      await page.waitForTimeout(500);
      
      // Test 6: 键盘平移 - 向上 (W key)
      console.log('[Test] Test 6: Keyboard pan up (W key)');
      await page.keyboard.down('w');
      await page.waitForTimeout(1500);
      await page.keyboard.up('w');
      await page.waitForTimeout(500);
      
      // Test 7: 组合操作 - 边移动边缩放
      console.log('[Test] Test 7: Combined pan and zoom');
      await page.keyboard.down('d');
      await page.waitForTimeout(500);
      await zoom(page, 3, -80, 200);
      await page.keyboard.up('d');
      await page.waitForTimeout(500);
      
      console.log('[Test] All tests completed!');
    }
  });
}

// 运行测试
testPanAndZoomControl()
  .then(() => {
    console.log('[Test] Recording completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Test] Recording failed:', error);
    process.exit(1);
  });
