/**
 * ReactFlow3D - ReactFlow 的 3D 容器
 * 
 * 职责：
 * 1. 订阅 Zustand Store，应用 CSS 3D transform 匹配相机视角
 * 2. 依赖 DOM 事件冒泡，拦截未被 ReactFlow 消费的 pointer 事件
 * 3. 将事件传给相机控制 Store
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCameraStore } from '../../store/cameraStore';
import { calculateCSSPerspective, DEFAULT_SPHERICAL_PHI } from '../../utils/coordinateTransform';

interface ReactFlow3DProps {
  children: React.ReactNode;
  fov: number;
}

export function ReactFlow3D({
  children,
  fov,
}: ReactFlow3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  
  // 我们不再使用 useCameraStore(state => ...) 来触发 React 渲染
  // 而是使用 useEffect + subscribe 直接操作 DOM，获得极致性能
  useEffect(() => {
    // 初始状态设置
    const state = useCameraStore.getState();
    if (transformRef.current) {
      transformRef.current.style.transform = `rotateX(${DEFAULT_SPHERICAL_PHI - state.cameraState.phi}rad) rotateY(${state.cameraState.theta}rad)`;
    }
    if (containerRef.current) {
      containerRef.current.style.perspective = `${calculateCSSPerspective(state.viewportSize.height, fov)}px`;
    }

    // 订阅状态变化
    const unsubscribe = useCameraStore.subscribe((newState) => {
      if (transformRef.current) {
        transformRef.current.style.transform = `rotateX(${DEFAULT_SPHERICAL_PHI - newState.cameraState.phi}rad) rotateY(${newState.cameraState.theta}rad)`;
      }
      if (containerRef.current) {
        containerRef.current.style.perspective = `${calculateCSSPerspective(newState.viewportSize.height, fov)}px`;
      }
    });

    return unsubscribe;
  }, [fov]);
  
  // Pointer Down 处理 - 依赖 DOM 事件冒泡
  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    // 如果事件源是 ReactFlow 的交互元素，让其自然处理，不拦截
    const isInteractive = target.closest('.react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__panel, .react-flow__controls, .react-flow__minimap');
    
    if (isInteractive) {
      return;
    }
    
    if (e.button === 2) {
      // 右键旋转
      useCameraStore.getState().startRotate(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    
    if (e.button === 0) {
      // 左键平移
      e.preventDefault();
      useCameraStore.getState().startPan(e.clientX, e.clientY);
    }
  }, []);
  
  // Pointer Move 处理
  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const state = useCameraStore.getState();
    if (state.input.isPanning || state.input.isRotating) {
      state.handlePointerMove(e.clientX, e.clientY);
    }
  }, []);
  
  // Pointer Up 处理
  const handlePointerUp = useCallback(() => {
    useCameraStore.getState().handlePointerUp();
  }, []);
  
  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as Element;
    // 如果在输入框里滚动，不拦截
    if (target.tagName?.toLowerCase() === 'input' || target.tagName?.toLowerCase() === 'textarea' || (target as HTMLElement).isContentEditable) {
      return;
    }
    
    useCameraStore.getState().handleWheel(e.deltaY);
    e.preventDefault();
  }, []);
  
  // 禁用右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
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
        zIndex: 1,
        overflow: 'visible',
        pointerEvents: 'auto',
        perspectiveOrigin: '50% 50%',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={transformRef}
        style={{
          width: '100vw',
          height: '100vh',
          transformStyle: 'preserve-3d',
          transformOrigin: '50% 50%', // 围绕视口中心旋转
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default ReactFlow3D;
