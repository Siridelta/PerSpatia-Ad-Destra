import type {
  CanvasEdgeFlowData,
  CanvasEdgeUIData,
  CanvasNodeFlowData,
  CanvasNodeUIData,
} from '@v1/types/canvas';
import type { CameraState } from '@v1/components/CameraControl';

/**
 * 画布持久化的最新结构（v10）
 * - `uiData` / `flowData` / `camera` 三者平级；不含 RF viewport（由 ReactFlow3D 从相机推导）
 * - 运行态使用 Map；持久化层使用 Record，避免 id 在 value 内重复存储
 */
export interface CanvasArchiveState {
  uiData: {
    nodes: Record<string, CanvasNodeUIData>;
    edges: Record<string, CanvasEdgeUIData>;
  };
  flowData: {
    nodes: CanvasNodeFlowData[];
    edges: CanvasEdgeFlowData[];
  };
  camera: CameraState;
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