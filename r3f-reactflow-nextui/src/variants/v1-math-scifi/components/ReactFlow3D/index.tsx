/**
 * ReactFlow3D - ReactFlow 的 3D 外壳
 *
 * 职责：
 * 1. 订阅相机 store，经 shellCssMath 写 CSS transform / perspective
 * 2. 将相机派生的 viewport 经 `ReactFlowViewportSync` 推给 React Flow（同 Provider 即可，不必挂在 RF 子树）
 * 3. 指针/滚轮由 `CameraControl` 全屏层处理（配合 `pointerPolicy`）
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { alpha, CameraState, DEFAULT_SPHERICAL_PHI, FOV, useCameraSubscribe } from '../CameraControl';
import { ReactFlowViewportSync } from './ReactFlowViewportSync';

interface ReactFlow3DProps {
  children: React.ReactNode;
}

export function buildShellTransform(phi: number, theta: number): string {
  return `rotateX(${phi - DEFAULT_SPHERICAL_PHI}rad) rotateY(${-theta}rad)`;
}

export function ReactFlow3D({ children }: ReactFlow3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);

  const updateStyle = useCallback((state: CameraState) => {
    if (transformRef.current) {
      transformRef.current.style.transform = buildShellTransform(
        state.phi,
        state.theta
      );
    }
    if (containerRef.current) {
      const style = containerRef.current.style;
      const fovRad = (FOV * Math.PI) / 180;
      const expans = Math.tan(fovRad / 2 + alpha) / Math.tan(fovRad / 2);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      style.perspective = `${(vh / 2) / Math.tan(fovRad / 2)}px`;
      style.width = `${vw * expans}px`;
      style.height = `${vh * expans}px`;
      style.left = `${-vw / 2 * (expans - 1)}px`;
      style.top = `${-vh / 2 * (expans - 1)}px`;
    }
  }, []);

  // 使用声明式的旁路订阅钩子
  useCameraSubscribe(updateStyle, (s) => s);

  // 初次挂载时由于依赖引用的稳定性，有时需要触发一次初始更新。
  // 通过一过性 state 和 ref 来规避复杂的 deps。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transformOrigin: '50% 50%',
        }}
      >
        <ReactFlowViewportSync />
        {children}
      </div>
    </div>
  );
}

export default ReactFlow3D;
