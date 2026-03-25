/**
 * 将相机 store 派生的视口单向推给 React Flow。
 *
 * 与官方文档里「必须挂在 <ReactFlow> 子树」的常见写法不同：此处仅依赖
 * App 层已包裹的 ReactFlowProvider。useReactFlow / useStoreApi 读的是同一套
 * zustand store；panZoom 在 <ReactFlow> 挂载后才就绪，此前 setViewport 为 no-op。
 */

import { useEffect } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';

import { alpha, CameraStore, FOV, useCameraControlStore } from '@/components/CameraControl';

/** 每 100px 屏幕对应 1 个 Three 单位（与 `docs/coordinates-transform.md` 一致）。 */
export const SCREEN_METRIC_TO_THREE = 100;

export function ReactFlowViewportSync() {
  const { setViewport, getViewport } = useReactFlow();
  const cameraStore = useCameraControlStore();

  /**
   * 首帧时 `panZoom` 常为 null，`setViewport` 会直接返回 false（不写 RF）。
   * 若此时相机已从存档写好且不再变，会一直保持错误 zoom，直到用户再动相机。
   * 订阅 RF 内部就绪条件，就绪后 effect 重跑并立刻 `sync()` 一次即可对齐。
   */
  const rfReady = useStore(
    (s) => s.panZoom != null && s.width > 0 && s.height > 0
  );


  /**
   * 墙面相机 → RF viewport；公式就地写全（含 `expans`），与 `v9-to-v10` 逆变换对照维护。
   * vw/vh 优先 store，与 `CameraControl` resize 一致。
   */
  const toControlledViewport = (state: CameraStore) => {
    const { cameraState, viewportSize } = state;
    const vw = viewportSize.width > 0 ? viewportSize.width : window.innerWidth;
    const vh = viewportSize.height > 0 ? viewportSize.height : window.innerHeight;

    const fovRad = (FOV * Math.PI) / 180;
    const standardZ = vh / 2 / SCREEN_METRIC_TO_THREE / Math.tan(fovRad / 2);
    const expans = Math.tan(fovRad / 2 + alpha) / Math.tan(fovRad / 2);
    const zoom = standardZ / cameraState.radius / expans;
    const x = (-cameraState.targetX * SCREEN_METRIC_TO_THREE - vw / 2) * zoom + vw / 2;
    const y = (cameraState.targetY * SCREEN_METRIC_TO_THREE - vh / 2) * zoom + vh / 2;
    return { x, y, zoom };
  };

  useEffect(() => {
    const sync = (state: CameraStore) => {
      const controlledViewport = toControlledViewport(state);
      const current = getViewport();
      const dx = Math.abs(current.x - controlledViewport.x);
      const dy = Math.abs(current.y - controlledViewport.y);
      const dz = Math.abs(current.zoom - controlledViewport.zoom);
      if (dx > 0.5 || dy > 0.5 || dz > 0.001) {
        void setViewport(controlledViewport);
      }
    };
    sync(cameraStore.getState());
    return cameraStore.subscribe(sync);
  }, [cameraStore, getViewport, setViewport, rfReady]);

  return null;
}
