import type { CameraState } from '@/components/CameraControl';
import {
  alpha,
  DEFAULT_CAMERA_OPTIONS,
  DEFAULT_SPHERICAL_PHI,
  DEFAULT_SPHERICAL_THETA,
  FOV,
} from '@/components/CameraControl/cameraStore';
import type { CanvasArchiveLegacy } from '@/types/persistence';
import type { V9CanvasStateLike } from './v8-to-v9';
import { SCREEN_METRIC_TO_THREE } from '@/components/ReactFlow3D/ReactFlowViewportSync';

/**
 * v9 -> v10:
 * - 独立字段 `camera`；旧档 `flowData.viewport` 尽量映射到相机平移/缩放
 */

export interface V10CameraState {
  targetX: number;
  targetY: number;
  radius: number;
  theta: number;
  phi: number;
}

export interface V10CanvasStateLike {
  uiData: {
    nodes: Record<string, any>;
    edges: Record<string, any>;
  };
  flowData: {
    nodes: any[];
    edges: any[];
  };
  camera: V10CameraState;
}

export const v9ToV10 = (archive: CanvasArchiveLegacy): CanvasArchiveLegacy => {
  if (archive.version >= 10) return archive;

  const state = (archive.state ?? {}) as V9CanvasStateLike;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vp = state.flowData?.viewport;
  const camera: V10CameraState = (() => {
    if (vp) {
      // 这里我们不用 expans 扩张因子，因为在旧存档里 reactflow 是未扩张的，所以需要不除以 expans 因子才能获得相同的视觉效果。
      const fovRad = (FOV * Math.PI) / 180;
      const standardZ = vh / 2 / Math.tan(fovRad / 2);
      const radius = standardZ / SCREEN_METRIC_TO_THREE / vp.zoom;
      const targetX = -((vp.x - vw / 2) / vp.zoom + vw / 2) / SCREEN_METRIC_TO_THREE;
      const targetY = ((vp.y - vh / 2) / vp.zoom + vh / 2) / SCREEN_METRIC_TO_THREE;
      return {
        targetX,
        targetY,
        radius,
        theta: DEFAULT_SPHERICAL_THETA,
        phi: DEFAULT_SPHERICAL_PHI,
      };
    }
    return {
      targetX: 0,
      targetY: 0,
      radius: DEFAULT_CAMERA_OPTIONS.initialRadius,
      theta: DEFAULT_SPHERICAL_THETA,
      phi: DEFAULT_SPHERICAL_PHI,
    };
  })();

  // 由于新的定义里 rf 坐标系的原点和 three 坐标系的原点在视觉上对齐了，但原来 rf 坐标系的原点在屏幕左上角
  // 因此需要集体偏移节点坐标 (-vw / 2, -vh / 2)
  if (state.flowData?.nodes) {
    state.flowData.nodes.forEach(node => {
      node.position.x -= vw / 2;
      node.position.y -= vh / 2;
    });
  }

  archive.state = {
    ...state,
    camera,
  };
  archive.version = 10;
  return archive;
};
