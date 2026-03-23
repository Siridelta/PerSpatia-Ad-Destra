/**
 * ReactFlow3D - ReactFlow 的 3D 容器
 * 
 * 职责：
 * 1. 应用 CSS 3D transform 匹配相机视角
 * 2. 拦截所有 pointer 事件，进行坐标转换
 * 3. 命中测试：判断是否命中 ReactFlow 内部元素
 * 4. 未命中时，将事件传给相机控制
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import type { CameraState } from '../../utils/coordinateTransform';
import { 
  screenToWorld, 
  worldToLocal, 
  calculateCSSPerspective 
} from '../../utils/coordinateTransform';

interface ReactFlow3DProps {
  children: React.ReactNode;
  cameraState: CameraState;
  camera: THREE.PerspectiveCamera | null;
  viewportWidth: number;
  viewportHeight: number;
  fov: number;
  
  // 相机控制回调
  onStartPan: (clientX: number, clientY: number) => void;
  onStartRotate: (clientX: number, clientY: number) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onWheel: (e: WheelEvent) => void;
}

export function ReactFlow3D({
  children,
  cameraState,
  camera,
  viewportWidth,
  viewportHeight,
  fov,
  onStartPan,
  onStartRotate,
  onPointerMove,
  onPointerUp,
  onWheel,
}: ReactFlow3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cssTransform, setCssTransform] = useState('');
  const [cssPerspective, setCssPerspective] = useState(1000);
  
  const { targetX, targetY, radius, theta, phi } = cameraState;
  
  // CSS transform 只处理 3D 旋转，不处理缩放
  // 缩放由 ReactFlow 自己的 viewport.zoom 处理
  useEffect(() => {
    // 旋转匹配相机视角，让 ReactFlow 层与 Three.js 场景对齐
    // 注意：theta 是水平旋转，phi 是垂直旋转
    const transform = `rotateX(${phi}rad) rotateY(${-theta}rad)`;
    setCssTransform(transform);
    // 透视值根据 FOV 计算
    const perspective = calculateCSSPerspective(viewportHeight, fov);
    setCssPerspective(perspective);
  }, [theta, phi, fov, viewportHeight]);
  
  // 检查元素或其祖先是否匹配选择器
  const isFlowElement = useCallback((element: EventTarget | null): boolean => {
    if (!element || !(element instanceof Element)) return false;
    
    const selectors = [
      '.react-flow__node',
      '.react-flow__edge', 
      '.react-flow__handle',
      '.react-flow__panel',
      '.react-flow__controls',
      '.react-flow__minimap',
    ];
    
    return selectors.some(selector => element.closest(selector) !== null);
  }, []);
  
  // 检查是否命中 ReactFlow 内部元素（使用坐标）
  const isHittingFlowElement = useCallback((clientX: number, clientY: number): boolean => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return false;
    return isFlowElement(element);
  }, [isFlowElement]);
  
  // 屏幕坐标 → ReactFlow 局部坐标
  const screenToFlowLocal = useCallback((screenX: number, screenY: number): { x: number; y: number } | null => {
    if (!camera) return null;
    
    const worldPos = screenToWorld(screenX, screenY, camera, viewportWidth, viewportHeight);
    if (!worldPos) return null;
    
    const local = worldToLocal(worldPos.x, worldPos.y, cameraState);
    
    return {
      x: local.x + viewportWidth / 2,
      y: local.y + viewportHeight / 2,
    };
  }, [camera, cameraState, viewportWidth, viewportHeight]);
  
  // 创建合成事件
  const createSyntheticEvent = useCallback((
    originalEvent: PointerEvent,
    localPos: { x: number; y: number }
  ): PointerEvent => {
    return new PointerEvent(originalEvent.type, {
      bubbles: true,
      cancelable: true,
      clientX: localPos.x,
      clientY: localPos.y,
      pointerId: originalEvent.pointerId,
      pointerType: originalEvent.pointerType,
      button: originalEvent.button,
      buttons: originalEvent.buttons,
      shiftKey: originalEvent.shiftKey,
      ctrlKey: originalEvent.ctrlKey,
      metaKey: originalEvent.metaKey,
    });
  }, []);
  
  // Pointer Down 处理
  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const nativeEvent = e.nativeEvent;
    
    // 优先检查 e.target（更可靠）
    const targetIsFlowElement = isFlowElement(e.target);
    const pointIsFlowElement = isHittingFlowElement(e.clientX, e.clientY);
    const isHitting = targetIsFlowElement || pointIsFlowElement;
    
    if (e.button === 2) {
      // 右键旋转 - 但如果命中节点则不处理
      if (!isHitting) {
        onStartRotate(e.clientX, e.clientY);
        e.preventDefault();
      }
      return;
    }
    
    if (e.button === 0) {
      if (isHitting) {
        // 命中节点/边：让事件自然冒泡给 ReactFlow，不拦截
        // ReactFlow 会自己处理拖拽
        return;
      } else {
        // 未命中：开始相机平移
        e.preventDefault();
        onStartPan(e.clientX, e.clientY);
      }
    }
  }, [isFlowElement, isHittingFlowElement, onStartPan, onStartRotate]);
  
  // Pointer Move 处理
  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerMove(e.nativeEvent);
  }, [onPointerMove]);
  
  // Pointer Up 处理
  const handlePointerUp = useCallback(() => {
    onPointerUp();
  }, [onPointerUp]);
  
  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    onWheel(e.nativeEvent);
    e.preventDefault();
  }, [onWheel]);
  
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
        perspective: `${cssPerspective}px`,
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
        style={{
          width: '100vw',
          height: '100vh',
          transformStyle: 'preserve-3d',
          transform: cssTransform,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default ReactFlow3D;
