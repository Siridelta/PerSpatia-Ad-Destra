/**
 * 伪缩放控制系统
 * 
 * 方案说明：
 * 为了让 ReactFlow 节点画布与 3D 场景同步缩放，我们使用伪缩放机制：
 * 
 * - ReactFlow 的 zoom 由伪缩放系统统一控制
 * - 3D 场景中的背景元素（菱形、星星等）与 ReactFlow 同步缩放
 * - 摄像机位置固定，不随缩放变化
 * 
 * 数学关系：
 * - pseudoZoom (z): 1.0 = 正常, >1 = 放大, <1 = 缩小
 * - ReactFlow zoom: z (节点变大/变小)
 * - 3D Scene scale: z (背景元素同步变大/变小)
 * 
 * 用户感知：
 * 滚轮向上 → "放大" → ReactFlow 节点变大 + 3D 背景元素变大
 * 滚轮向下 → "缩小" → ReactFlow 节点变小 + 3D 背景元素变小
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePseudoZoomOptions {
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;
}

interface UsePseudoZoomReturn {
  /** 当前伪缩放值 (1.0 = 正常) */
  pseudoZoom: number;
  /** 设置缩放值 */
  setPseudoZoom: (zoom: number) => void;
  /** 用于 3D 场景的同向缩放系数 (与 pseudoZoom 相同) */
  sceneScale: number;
  /** 用于 ReactFlow 的 CSS transform */
  cssTransform: string;
}

export function usePseudoZoom({
  initialZoom = 1,
  minZoom = 0.1,
  maxZoom = 3,
  zoomSpeed = 0.001,
}: UsePseudoZoomOptions = {}): UsePseudoZoomReturn {
  const [pseudoZoom, setZoomState] = useState(initialZoom);
  const isZoomingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const velocityRef = useRef(0);

  // 带限制的缩放设置
  const setPseudoZoom = useCallback((zoom: number) => {
    setZoomState(Math.max(minZoom, Math.min(maxZoom, zoom)));
  }, [minZoom, maxZoom]);

  // 处理滚轮事件
  useEffect(() => {
    console.log('[usePseudoZoom] Wheel listener attached');
    
    const handleWheel = (e: WheelEvent) => {
      console.log('[usePseudoZoom] Wheel event:', e.deltaY);
      
      // 如果正在编辑文本，不处理滚轮缩放
      const target = e.target as HTMLElement;
      if (target && target.tagName) {
        const isEditable = target.tagName.toLowerCase() === 'input' ||
                          target.tagName.toLowerCase() === 'textarea' ||
                          target.isContentEditable;
        if (isEditable) {
          console.log('[usePseudoZoom] Ignored - editable target');
          return;
        }
      }

      // 阻止默认滚动行为
      e.preventDefault();

      // 计算缩放变化（deltaY < 0 是向上滚，应该放大）
      const delta = -e.deltaY * zoomSpeed;
      console.log('[usePseudoZoom] Calculated delta:', delta);
      
      // 应用惯性效果
      velocityRef.current = delta;
      
      if (!isZoomingRef.current) {
        isZoomingRef.current = true;
        console.log('[usePseudoZoom] Starting animation');
        
        const animate = () => {
          if (Math.abs(velocityRef.current) < 0.001) {
            isZoomingRef.current = false;
            velocityRef.current = 0;
            rafIdRef.current = null;
            console.log('[usePseudoZoom] Animation stopped');
            return;
          }

          setZoomState(prev => {
            const newZoom = prev * (1 + velocityRef.current);
            const clamped = Math.max(minZoom, Math.min(maxZoom, newZoom));
            console.log('[usePseudoZoom] Zoom updated:', prev, '->', clamped);
            return clamped;
          });

          // 衰减速度
          velocityRef.current *= 0.85;
          
          rafIdRef.current = requestAnimationFrame(animate);
        };
        
        rafIdRef.current = requestAnimationFrame(animate);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      console.log('[usePseudoZoom] Wheel listener removed');
      window.removeEventListener('wheel', handleWheel);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [minZoom, maxZoom, zoomSpeed]);

  // 计算派生值
  const sceneScale = pseudoZoom;  // 3D 场景同向缩放（与 ReactFlow 同步）
  const cssTransform = `scale(${pseudoZoom})`;  // ReactFlow CSS 缩放

  return {
    pseudoZoom,
    setPseudoZoom,
    sceneScale,
    cssTransform,
  };
}
