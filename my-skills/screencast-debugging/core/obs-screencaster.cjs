/**
 * OBS Screencaster - OBS + Playwright 一体化录屏模块
 *
 * 使用方法：
 * const { record } = require('./core/obs-screencaster.cjs');
 *
 * await record({
 *   cdpUrl: 'http://localhost:9222',      // 浏览器 CDP 地址
 *   obsAddress: 'ws://localhost:4455',    // OBS WebSocket 地址
 *   url: 'http://localhost:5173',         // 要录制的页面
 *   preDelay: 3000,                       // 页面加载后等待
 *   postDelay: 1000,                      // 操作后等待
 *   action: async (page) => {            // 只需操作 page
 *     await page.mouse.wheel(0, -100);
 *   }
 * });
 */

const { chromium } = require('playwright');
const OBSWebSocket = require('obs-websocket-js').default;

/**
 * 一体化录屏：OBS 录制 + Playwright 操作
 * @param {Object} options
 * @param {string} options.cdpUrl - 浏览器 CDP 地址（默认 http://localhost:9222）
 * @param {string} options.obsAddress - OBS WebSocket 地址（默认 ws://localhost:4455）
 * @param {string} options.obsPassword - OBS 密码（默认空）
 * @param {string} options.url - 要导航的页面 URL
 * @param {number} options.preDelay - 页面加载后等待时间（默认 3000ms）
 * @param {number} options.postDelay - 操作后等待时间（默认 1000ms）
 * @param {number} options.viewport - 视口大小（默认 1920x1080）
 * @param {boolean} options.useExistingPage - 是否使用已有页面（默认 true，不开新窗口）
 * @param {Function} options.action - 操作函数，接收 page 参数
 */
async function record(options) {
  const {
    cdpUrl = 'http://localhost:9222',
    obsAddress = 'ws://localhost:4455',
    obsPassword = '',
    url = 'http://localhost:5173',
    preDelay = 3000,
    postDelay = 1000,
    viewport = { width: 1920, height: 1080 },
    useExistingPage = true,
    action
  } = options;

  if (!action || typeof action !== 'function') {
    throw new Error('action function is required');
  }

  const obs = new OBSWebSocket();
  let browser = null;
  let recordingStarted = false;

  try {
    // ===== 1. 连接 OBS =====
    console.log(`[OBS-Screencaster] Connecting to OBS at ${obsAddress}...`);
    const { obsWebSocketVersion } = await obs.connect(obsAddress, obsPassword);
    console.log(`[OBS-Screencaster] OBS connected! Version: ${obsWebSocketVersion}`);

    // 检查是否已在录制
    const status = await obs.call('GetRecordStatus');
    if (status.outputActive) {
      console.log('[OBS-Screencaster] Warning: OBS already recording, stopping first...');
      await obs.call('StopRecord');
      await new Promise(r => setTimeout(r, 1000));
    }

    // ===== 2. 连接浏览器 =====
    console.log(`[OBS-Screencaster] Connecting to browser at ${cdpUrl}...`);
    browser = await chromium.connectOverCDP(cdpUrl);
    console.log(`[OBS-Screencaster] Browser connected!`);

    // 获取或创建页面
    let page;
    const contexts = browser.contexts();

    if (useExistingPage && contexts.length > 0 && contexts[0].pages().length > 0) {
      page = contexts[0].pages()[0];
      console.log('[OBS-Screencaster] Using existing page');
    } else {
      const context = await browser.newContext({ viewport });
      page = await context.newPage();
      console.log('[OBS-Screencaster] Created new page');
    }

    // 设置视口（对已有页面也生效）
    await page.setViewportSize(viewport);

    // ===== 3. 导航到目标页面 =====
    if (url) {
      console.log(`[OBS-Screencaster] Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle' });
    }

    // 等待页面稳定
    if (preDelay > 0) {
      console.log(`[OBS-Screencaster] Waiting ${preDelay}ms for page stabilization...`);
      await page.waitForTimeout(preDelay);
    }

    // ===== 4. 开始录制 =====
    console.log('[OBS-Screencaster] Starting OBS recording...');
    await obs.call('StartRecord');
    recordingStarted = true;
    console.log('[OBS-Screencaster] Recording started!');

    // 给 OBS 一点时间开始录制
    await new Promise(r => setTimeout(r, 500));

    // ===== 5. 执行用户操作 =====
    console.log('[OBS-Screencaster] Executing action...');
    await action(page);

    // 操作后等待
    if (postDelay > 0) {
      console.log(`[OBS-Screencaster] Waiting ${postDelay}ms after action...`);
      await page.waitForTimeout(postDelay);
    }

    // ===== 6. 停止录制 =====
    console.log('[OBS-Screencaster] Stopping OBS recording...');
    const { outputPath } = await obs.call('StopRecord');
    recordingStarted = false;
    console.log(`[OBS-Screencaster] Recording saved to: ${outputPath}`);

    return { outputPath, page, browser };

  } catch (error) {
    console.error('[OBS-Screencaster] Error:', error.message);

    // 确保停止录制
    if (recordingStarted) {
      try {
        await obs.call('StopRecord');
      } catch (e) {
        // 忽略停止错误
      }
    }

    throw error;

  } finally {
    // 断开连接
    if (browser) {
      await browser.close();
    }
    try {
      await obs.disconnect();
    } catch (e) {
      // 忽略断开错误
    }
  }
}

/**
 * 便捷工具函数：滚轮缩放
 * @param {Object} page - Playwright page
 * @param {number} steps - 滚动步数
 * @param {number} deltaY - 每步滚动量（负值放大，正值缩小）
 * @param {number} delay - 每步间隔（毫秒）
 */
async function zoom(page, steps = 5, deltaY = -100, delay = 500) {
  const viewport = page.viewportSize();
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;

  await page.mouse.move(centerX, centerY);

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY);
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }
  }
}

/**
 * 便捷工具函数：拖拽平移
 * @param {Object} page - Playwright page
 * @param {number} deltaX - X 方向移动
 * @param {number} deltaY - Y 方向移动
 * @param {number} duration - 拖拽持续时间（毫秒）
 */
async function pan(page, deltaX = 200, deltaY = 0, duration = 1000) {
  const viewport = page.viewportSize();
  const startX = viewport.width / 2;
  const startY = viewport.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  const steps = 10;
  const stepDelay = duration / steps;

  for (let i = 1; i <= steps; i++) {
    const x = startX + (deltaX / steps) * i;
    const y = startY + (deltaY / steps) * i;
    await page.mouse.move(x, y);
    await page.waitForTimeout(stepDelay);
  }

  await page.mouse.up();
}

/**
 * 便捷工具函数：点击元素
 * @param {Object} page - Playwright page
 * @param {string} selector - CSS 选择器
 * @param {number} delay - 点击后等待（毫秒）
 */
async function click(page, selector, delay = 500) {
  await page.click(selector);
  if (delay > 0) {
    await page.waitForTimeout(delay);
  }
}

module.exports = {
  record,
  zoom,
  pan,
  click
};
