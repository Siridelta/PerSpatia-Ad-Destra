import { useEffect, useState } from 'react';
import type { CanvasUIDataApi } from './useCanvasUIData';
import type { CanvasFlowDataApi } from './useCanvasFlowData';
import { parseCanvasArchiveText, serializeCanvasArchive, STORAGE_KEY } from '@/services/canvas-archive';
import { CanvasArchiveState } from '@/types/persistence';

/**
 * 画布状态持久化层：
 * - 负责把 UIData/FlowData 与 localStorage 同步
 * - 首次挂载时执行 hydration
 * - 后续在状态变化时保存快照
 */

/**
 * 保存画布状态到 localStorage
 */
const saveState = (state: CanvasArchiveState) => {
  try {
    localStorage.setItem(STORAGE_KEY, serializeCanvasArchive(state));
  } catch (error) {
    console.error('保存画布状态失败:', error);
  }
};

/**
 * 从 localStorage 加载画布状态
 */
const loadState = (): CanvasArchiveState | null => {
  try {
    const str = localStorage.getItem(STORAGE_KEY);
    if (!str) return null;
    return parseCanvasArchiveText(str);
  } catch (error) {
    console.error('加载画布状态失败:', error);
    return null;
  }
};

/**
 * 清除 localStorage 中的画布状态
 */
const clearState = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('清除画布状态失败:', error);
  }
};

export const useCanvasStatePersistence = (uiDataApi: CanvasUIDataApi, flowDataApi: CanvasFlowDataApi): { isHydrated: boolean } => {
  const uiData = uiDataApi.useUIData((data) => data);
  const flowData = flowDataApi.useFlowData((data) => data);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const persisted = loadState();
    if (persisted) {
      uiDataApi.importUIData(persisted.uiData);
      flowDataApi.importFlowData(persisted.flowData);
    }
    setIsHydrated(true);
  }, [loadState, uiDataApi, flowDataApi]);

  useEffect(() => {
    // 避免在未加载完成时保存状态
    if (!isHydrated) return;
    saveState({
      uiData,
      flowData,
    });
  }, [uiData, flowData, saveState, isHydrated]);

  return {
    isHydrated,
  }
};

