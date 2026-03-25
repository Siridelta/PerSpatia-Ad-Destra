/**
 * ReactFlow3D - ReactFlow 的 3D 外壳
 *
 * 职责：
 * 1. 订阅相机 store，经 shellCssMath 写 CSS transform / perspective
 * 2. 将相机派生的 viewport 经 `ReactFlowViewportSync` 推给 React Flow（同 Provider 即可，不必挂在 RF 子树）
 * 3. 指针/滚轮由 `CameraControl` 全屏层处理（配合 `pointerPolicy`）
 */

import React, { useRef, useEffect } from 'react';
import { useCameraControlStore } from '../CameraControl';
import { ReactFlowViewportSync } from './ReactFlowViewportSync';
import { buildShellTransform, calculateCSSPerspective } from './shellCssMath';

interface ReactFlow3DProps {
  children: React.ReactNode;
  fov: number;
}

export function ReactFlow3D({ children, fov }: ReactFlow3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const cameraStore = useCameraControlStore();

  useEffect(() => {
    const state = cameraStore.getState();
    if (transformRef.current) {
      transformRef.current.style.transform = buildShellTransform(
        state.cameraState.phi,
        state.cameraState.theta
      );
    }
    if (containerRef.current) {
      containerRef.current.style.perspective = `${calculateCSSPerspective(state.viewportSize.height, fov)}px`;
    }

    const unsubscribe = cameraStore.subscribe((newState) => {
      if (transformRef.current) {
        transformRef.current.style.transform = buildShellTransform(
          newState.cameraState.phi,
          newState.cameraState.theta
        );
      }
      if (containerRef.current) {
        containerRef.current.style.perspective = `${calculateCSSPerspective(newState.viewportSize.height, fov)}px`;
      }
    });

    return unsubscribe;
  }, [cameraStore, fov]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        overflow: 'visible',
        pointerEvents: 'auto',
        perspectiveOrigin: '50% 50%',
      }}
      className="react-flow-3d"
    >
      <div
        ref={transformRef}
        style={{
          width: '100vw',
          height: '100vh',
          transformStyle: 'preserve-3d',
          transformOrigin: '50% 50%',
          willChange: 'transform',
        }}
      >
        <ReactFlowViewportSync />
        {children}
      </div>
    </div>
  );
}

export default ReactFlow3D;
