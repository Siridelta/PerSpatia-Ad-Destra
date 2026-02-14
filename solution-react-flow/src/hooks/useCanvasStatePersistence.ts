import { useEffect, useState } from 'react';
import { useCanvasPersistenceStore } from '@/store/canvasPersistenceStore';
import type { CanvasUIDataApi } from './useCanvasUIData';
import type { CanvasFlowDataApi } from './useCanvasFlowData';

/**
 * 画布状态持久化桥接层：
 * - 负责把 UIData/FlowData 与 persistence store 解耦
 * - 首次挂载时执行 hydration
 * - 后续在状态变化时保存快照
 */
export const useCanvasStatePersistence = (uiDataApi: CanvasUIDataApi, flowDataApi: CanvasFlowDataApi): { isHydrated: boolean } => {
  const { loadState, saveState } = useCanvasPersistenceStore();
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

