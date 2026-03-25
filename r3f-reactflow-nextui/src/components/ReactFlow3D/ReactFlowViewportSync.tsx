/**
 * 将相机 store 派生的视口单向推给 React Flow。
 *
 * 与官方文档里「必须挂在 <ReactFlow> 子树」的常见写法不同：此处仅依赖
 * App 层已包裹的 ReactFlowProvider。useReactFlow / useStoreApi 读的是同一套
 * zustand store；panZoom 在 <ReactFlow> 挂载后才就绪，此前 setViewport 为 no-op。
 */

import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

import { CameraState, FOV, useCameraControlStore } from '@/components/CameraControl';

// 每 100px 屏幕，对应 1 个 Three.js 单位
const SCREEN_METRIC_TO_THREE_METRIC = 100;

export function ReactFlowViewportSync() {
  const { setViewport, getViewport } = useReactFlow();
  const cameraStore = useCameraControlStore();

  const toControlledViewport = (cameraState: CameraState) => {
    // return {
    //   x: -cameraState.targetX,
    //   y: cameraState.targetY,
    //   zoom: 30 / cameraState.radius,
    // };
    const standardZ = window.innerHeight / 2 / Math.tan(FOV / 2 * Math.PI / 180);
    const zoom = standardZ / SCREEN_METRIC_TO_THREE_METRIC / cameraState.radius;
    const x = (-cameraState.targetX * SCREEN_METRIC_TO_THREE_METRIC - window.innerWidth / 2) * zoom + window.innerWidth / 2;
    const y = (cameraState.targetY * SCREEN_METRIC_TO_THREE_METRIC - window.innerHeight / 2) * zoom + window.innerHeight / 2;
    return {
      x,
      y,
      zoom,
    };
  };

  useEffect(() => {
    const sync = () => {
      const { cameraState } = cameraStore.getState();
      const controlledViewport = toControlledViewport(cameraState);
      const current = getViewport();
      const dx = Math.abs(current.x - controlledViewport.x);
      const dy = Math.abs(current.y - controlledViewport.y);
      const dz = Math.abs(current.zoom - controlledViewport.zoom);
      if (dx > 0.5 || dy > 0.5 || dz > 0.001) {
        void setViewport(controlledViewport);
      }
    };

    sync();
    return cameraStore.subscribe(sync);
  }, [cameraStore, getViewport, setViewport]);

  return null;
}
