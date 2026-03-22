/**
 * OBS Controller - OBS WebSocket 控制模块
 * 用于自动化控制 OBS 录制功能
 *
 * 使用方法：
 * const { OBSController } = require('./core/obs-controller.cjs');
 * const obs = new OBSController({ address: 'ws://localhost:4455' });
 *
 * await obs.connect();
 * await obs.startRecording();
 * // ... 执行操作 ...
 * await obs.stopRecording();
 * await obs.disconnect();
 */

const OBSWebSocket = require('obs-websocket-js').default;

class OBSController {
  constructor(options = {}) {
    this.address = options.address || 'ws://localhost:4455';
    this.password = options.password || '';
    this.obs = new OBSWebSocket();
    this.connected = false;
  }

  /**
   * 连接到 OBS WebSocket
   */
  async connect() {
    try {
      console.log(`[OBS] Connecting to ${this.address}...`);
      const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(
        this.address,
        this.password
      );
      this.connected = true;
      console.log(`[OBS] Connected! OBS Version: ${obsWebSocketVersion}, RPC: ${negotiatedRpcVersion}`);
      return true;
    } catch (error) {
      console.error('[OBS] Connection failed:', error.message);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.connected) {
      await this.obs.disconnect();
      this.connected = false;
      console.log('[OBS] Disconnected');
    }
  }

  /**
   * 开始录制
   */
  async startRecording() {
    try {
      console.log('[OBS] Starting recording...');
      const { outputActive, outputPath } = await this.obs.call('StartRecord');
      console.log(`[OBS] Recording started! Path: ${outputPath || 'N/A'}`);
      return { outputActive, outputPath };
    } catch (error) {
      // 如果已经在录制，返回当前状态
      if (error.code === 501) {
        console.log('[OBS] Already recording');
        return await this.getRecordingStatus();
      }
      throw error;
    }
  }

  /**
   * 停止录制
   */
  async stopRecording() {
    try {
      console.log('[OBS] Stopping recording...');
      const { outputActive, outputPath } = await this.obs.call('StopRecord');
      console.log(`[OBS] Recording stopped! Saved to: ${outputPath}`);
      return { outputActive, outputPath };
    } catch (error) {
      if (error.code === 501) {
        console.log('[OBS] Not currently recording');
        return { outputActive: false, outputPath: null };
      }
      throw error;
    }
  }

  /**
   * 获取录制状态
   */
  async getRecordingStatus() {
    const status = await this.obs.call('GetRecordStatus');
    return status;
  }

  /**
   * 暂停录制
   */
  async pauseRecording() {
    try {
      await this.obs.call('PauseRecord');
      console.log('[OBS] Recording paused');
    } catch (error) {
      console.error('[OBS] Failed to pause:', error.message);
    }
  }

  /**
   * 恢复录制
   */
  async resumeRecording() {
    try {
      await this.obs.call('ResumeRecord');
      console.log('[OBS] Recording resumed');
    } catch (error) {
      console.error('[OBS] Failed to resume:', error.message);
    }
  }

  /**
   * 获取当前场景列表
   */
  async getSceneList() {
    const { scenes, currentProgramSceneName } = await this.obs.call('GetSceneList');
    return { scenes, currentProgramSceneName };
  }

  /**
   * 切换到指定场景
   */
  async setScene(sceneName) {
    await this.obs.call('SetCurrentProgramScene', { sceneName });
    console.log(`[OBS] Switched to scene: ${sceneName}`);
  }

  /**
   * 获取录制设置
   */
  async getRecordDirectory() {
    const { recordDirectory } = await this.obs.call('GetRecordDirectory');
    return recordDirectory;
  }
}

/**
 * 便捷函数：录制包裹器
 * 自动连接 OBS，执行操作，然后停止录制
 *
 * @param {Object} options
 * @param {string} options.address - OBS WebSocket 地址
 * @param {string} options.password - OBS WebSocket 密码（可选）
 * @param {Function} options.action - 要执行的操作函数
 */
async function withOBSRecording(options) {
  const { address = 'ws://localhost:4455', password = '', action } = options;

  const obs = new OBSController({ address, password });

  try {
    // 连接 OBS
    await obs.connect();

    // 检查当前状态
    const status = await obs.getRecordingStatus();
    if (status.outputActive) {
      console.log('[OBS] Warning: Already recording, will stop and restart');
      await obs.stopRecording();
    }

    // 开始录制
    await obs.startRecording();

    // 执行用户操作
    console.log('[OBS] Executing action...');
    await action();

    // 停止录制
    const result = await obs.stopRecording();

    return result;
  } catch (error) {
    console.error('[OBS] Recording failed:', error);
    // 确保停止录制
    try {
      await obs.stopRecording();
    } catch (e) {
      // 忽略停止错误
    }
    throw error;
  } finally {
    await obs.disconnect();
  }
}

module.exports = {
  OBSController,
  withOBSRecording
};
