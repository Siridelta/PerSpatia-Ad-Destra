import type {
  CanvasEdgeFlowData,
  CanvasEdgeUIData,
  CanvasNodeFlowData,
  CanvasNodeUIData,
} from '@/types/canvas';
import type { Viewport } from '@xyflow/react';

/**
 * 画布持久化的最新结构（v9）
 * - 运行态使用 Map
 * - 持久化层使用 Record，避免 id 在 value 内重复存储
 */
export interface CanvasArchiveState {
  uiData: {
    nodes: Record<string, CanvasNodeUIData>;
    edges: Record<string, CanvasEdgeUIData>;
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