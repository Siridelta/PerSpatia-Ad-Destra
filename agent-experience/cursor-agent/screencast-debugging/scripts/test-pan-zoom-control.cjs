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
const path = require('path');

async function testPanAndZoomControl() {
  // 计算 assets 目录路径（项目根目录下的 assets）
  const assetsDir = path.resolve(__dirname, '../../../assets');

  await record({
    // OBS 配置
    obsAddress: 'ws://localhost:4455',
    obsPassword: '',

    // 浏览器配置
    cdpUrl: 'http://localhost:9222',
    url: 'http://localhost:5173',
    useExistingPage: true,

    // 录制参数
    preDelay: 3000,
    postDelay: 2000,

    // 输出目录（录制完成后移动到该目录）
    outputDir: assetsDir,

    // 核心操作
    action: async (page) => {
      console.log('[Test] Reloading page to reset state...');
      
      // 强制刷新页面，完全重置状态
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      console.log('[Test] Starting usePanAndZoomControl tests...');
      
      // 点击页面获取焦点
      await page.click('body');
      await page.waitForTimeout(500);
      
      // Test 1: 滚轮缩放（放大）
      console.log('[Test] Test 1: Wheel zoom in');
      await zoom(page, 5, -100, 300);
      await page.waitForTimeout(1000);
      
      // Test 2: 滚轮缩放（缩小）
      console.log('[Test] Test 2: Wheel zoom out');
      await zoom(page, 3, 150, 300);
      await page.waitForTimeout(1000);
      
      // Test 3-6: 键盘平移 - 使用 dispatchEvent
      console.log('[Test] Test 3-6: Keyboard pan using dispatchEvent');
      
      await page.evaluate(() => {
        const keyDown = (key) => {
          const event = new KeyboardEvent('keydown', {
            key: key,
            bubbles: true,
            cancelable: true,
          });
          window.dispatchEvent(event);
        };
        const keyUp = (key) => {
          const event = new KeyboardEvent('keyup', {
            key: key,
            bubbles: true,
            cancelable: true,
          });
          window.dispatchEvent(event);
        };
        
        // D - right
        keyDown('d');
        setTimeout(() => keyUp('d'), 500);
        
        // A - left (after 1s)
        setTimeout(() => {
          keyDown('a');
          setTimeout(() => keyUp('a'), 500);
        }, 1000);
        
        // S - down (after 2s)
        setTimeout(() => {
          keyDown('s');
          setTimeout(() => keyUp('s'), 500);
        }, 2000);
        
        // W - up (after 3s)
        setTimeout(() => {
          keyDown('w');
          setTimeout(() => keyUp('w'), 500);
        }, 3000);
      });
      
      await page.waitForTimeout(4000); // 等待所有键盘操作完成
      
      // Test 7: 组合操作 - 边移动边缩放
      console.log('[Test] Test 7: Combined pan and zoom');
      await page.keyboard.down('d');
      await page.waitForTimeout(400);
      await zoom(page, 3, -80, 200);
      await page.keyboard.up('d');
      await page.waitForTimeout(1000);
      
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
