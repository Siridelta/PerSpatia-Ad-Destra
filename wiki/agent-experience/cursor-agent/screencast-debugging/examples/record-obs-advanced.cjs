/**
 * OBS + Playwright 高级示例（使用底层 OBSController）
 * 如需更精细控制 OBS（切换场景、暂停等），使用此模式
 * 如需简单录制，建议使用 obs-screencaster.cjs
 */

const { OBSController } = require('../core/obs-controller.cjs');
const { chromium } = require('playwright');

const CONFIG = {
  obsAddress: 'ws://localhost:4455',
  obsPassword: '',
  cdpUrl: 'http://localhost:9222',
  url: 'http://localhost:5173',
};

async function main() {
  const obs = new OBSController({
    address: CONFIG.obsAddress,
    password: CONFIG.obsPassword
  });

  try {
    // 连接 OBS
    await obs.connect();

    // 获取场景列表（示例）
    const { scenes, currentProgramSceneName } = await obs.getSceneList();
    console.log(`Current scene: ${currentProgramSceneName}`);
    console.log(`Available scenes: ${scenes.map(s => s.sceneName).join(', ')}`);

    // 切换场景（可选）
    // await obs.setScene('Scene 2');

    // 连接浏览器
    const browser = await chromium.connectOverCDP(CONFIG.cdpUrl);
    const contexts = browser.contexts();
    const page = contexts[0]?.pages()[0] || await browser.newPage();

    // 导航
    await page.goto(CONFIG.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 开始录制
    await obs.startRecording();

    // 执行操作
    const viewport = page.viewportSize();
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;

    await page.mouse.move(cx, cy);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(500);
    }

    // 暂停录制示例（可选）
    // await obs.pauseRecording();
    // await page.waitForTimeout(2000);
    // await obs.resumeRecording();

    await page.waitForTimeout(1000);

    // 停止录制
    const result = await obs.stopRecording();
    console.log(`Saved to: ${result.outputPath}`);

    await browser.close();
    await obs.disconnect();

  } catch (err) {
    console.error('Error:', err);
    await obs.disconnect();
    process.exit(1);
  }
}

main();
