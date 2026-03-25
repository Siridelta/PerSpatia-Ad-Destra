import type { CameraState } from '@/components/CameraControl';
import {
  DEFAULT_CAMERA_OPTIONS,
  DEFAULT_SPHERICAL_PHI,
  DEFAULT_SPHERICAL_THETA,
  FOV,
} from '@/components/CameraControl/cameraStore';
import type { CanvasArchiveLegacy } from '@/types/persistence';
import type { V9CanvasStateLike } from './v8-to-v9';
import { SCREEN_METRIC_TO_THREE_METRIC } from '@/components/ReactFlow3D/ReactFlowViewportSync';

/**
 * v9 -> v10:
 * - 独立字段 `camera`；旧档 `flowData.viewport` 尽量映射到相机平移/缩放
 */
export const v9ToV10 = (archive: CanvasArchiveLegacy): CanvasArchiveLegacy => {
  if (archive.version >= 10) return archive;

  const state = (archive.state ?? {}) as V9CanvasStateLike;

  const vp = state.flowData?.viewport;
  const camera: CameraState = (() => {
    if (vp) {
      const standardZ = window.innerHeight / 2 / Math.tan(FOV / 2 * Math.PI / 180);
      const radius = standardZ / SCREEN_METRIC_TO_THREE_METRIC / vp.zoom;
      const targetX = -((vp.x - window.innerWidth / 2) / vp.zoom + window.innerWidth / 2) / SCREEN_METRIC_TO_THREE_METRIC;
      const targetY = ((vp.y - window.innerHeight / 2) / vp.zoom + window.innerHeight / 2) / SCREEN_METRIC_TO_THREE_METRIC;
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

  archive.state = {
    ...state,
    camera,
  };
  archive.version = 10;
  return archive;
};
