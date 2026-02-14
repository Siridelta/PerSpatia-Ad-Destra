import type {
  CanvasEdgeFlowData,
  CanvasEdgeUIDataEntry,
  CanvasNodeFlowData,
  CanvasNodeUIDataEntry,
} from '@/types/canvas';
import type { Viewport } from '@xyflow/react';

/**
 * 画布持久化的最新结构（v8）
 */
export interface CanvasArchiveState {
  uiData: {
    nodes: CanvasNodeUIDataEntry[];
    edges: CanvasEdgeUIDataEntry[];
  };
  flowData: {
    nodes: CanvasNodeFlowData[];
    edges: CanvasEdgeFlowData[];
    viewport: Viewport;
  };
}

/**
 * 带版本元信息的存档包结构（最新版本）。
 */
export interface CanvasArchive {
  version: number;
  state: CanvasArchiveState;
}

/**
 * 带版本元信息的存档包结构（各历史版本）。
 */
export interface CanvasArchiveLegacy {
  version: number;
  state: any;
}