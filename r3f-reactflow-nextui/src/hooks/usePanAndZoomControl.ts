/**
 * usePanAndZoomControl - 统一的相机控制钩子
 * 
 * 职责：
 * 1. 统一接管除旋转外的所有相机控制（缩放、平移）
 * 2. 内置 viewport 状态管理 {x, y, zoom}
 * 3. 响应用户输入事件（滚轮缩放、拖拽平移、键盘平移）
 * 4. 同步状态到 ReactFlow 2D 画布和 3D 场景
 * 5. 检测外部 viewport 变化并反向同步到内置状态
 * 
 * 设计原则：
 * - 单一数据源：内部 state 是唯一的 viewport 真源
 * - 双向同步：既主动更新视图，也监听外部变化
 * - 旋转独立：OrbitControls 保留右键旋转，但禁用其 zoom/pan
 * 
 * 3D 场景同步策略：
 * - zoom → 3D 元素缩放 (sceneScale = zoom)
 * - x,y → OrbitControls target 偏移（反向）
 * - 先缩放后移动：zoom 影响坐标比例，x,y 是绝对偏移
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactFlowInstance, Viewport } from '@xyflow/react';
import * as THREE from 'three';

// 配置选项
export interface PanAndZoomControlOptions {
  /** 初始 viewport */
  initialViewport?: Viewport;
  /** 最小缩放 */
  minZoom?: number;
  /** 最大缩放 */
  maxZoom?: number;
  /** 滚轮缩放速度 */
  zoomSpeed?: number;
  /** 键盘平移加速度 */
  panAcceleration?: number;
  /** 键盘平移最大速度 */
  panMaxSpeed?: number;
  /** 3D 场景移动灵敏度（像素到 3D 单位的转换系数）*/
  scenePanSensitivity?: number;
}

// 控制器的引用接口
export interface PanAndZoomControlRef {
  /** 获取当前 viewport */
  getViewport: () => Viewport;
  /** 设置 viewport */
  setViewport: (viewport: Viewport) => void;
  /** 获取 3D OrbitControls 引用（用于设置 target） */
  setOrbitControls: (controls: OrbitControlsLike | null) => void;
}

// 简化版 OrbitControls 接口
interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
  enabled: boolean;
}

// 惯性运动状态
interface InertialState {
  velocityX: number;
  velocityY: number;
  directionX: number;
  directionY: number;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_EPSILON = 0.0001;

// 比较两个 viewport 是否相等
function isSameViewport(a: Viewport, b: Viewport): boolean {
  return (
    Math.abs(a.x - b.x) < VIEWPORT_EPSILON &&
    Math.abs(a.y - b.y) < VIEWPORT_EPSILON &&
    Math.abs(a.zoom - b.zoom) < VIEWPORT_EPSILON
  );
}

// 限制 viewport 在合理范围内
function clampViewport(viewport: Viewport, minZoom: number, maxZoom: number): Viewport {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: Math.max(minZoom, Math.min(maxZoom, viewport.zoom)),
  };
}

/**
 * 创建 PanAndZoomControl 实例
 * 
 * 这是一个工厂函数，创建与 React 无关的控制逻辑。
 * 可以在非 React 环境中使用，也可以通过 usePanAndZoomControl 在 React 中使用。
 */
export function createPanAndZoomControl(options: PanAndZoomControlOptions = {}) {
  const {
    initialViewport = DEFAULT_VIEWPORT,
    minZoom = 0.1,
    maxZoom = 3,
    zoomSpeed = 0.001,
    panAcceleration = 0.3,      // 进一步降低加速度
    panMaxSpeed = 2,            // 进一步降低最大速度
    scenePanSensitivity = 0.05, // 2D 像素到 3D 单位的转换
  } = options;

  // 当前状态
  let currentViewport: Viewport = { ...initialViewport };
  
  // OrbitControls 引用
  let orbitControls: OrbitControlsLike | null = null;
  
  // 惯性状态
  const inertialState: InertialState = {
    velocityX: 0,
    velocityY: 0,
    directionX: 0,
    directionY: 0,
  };

  // 订阅者列表
  const subscribers = new Set<(viewport: Viewport) => void>();
  
  // ReactFlow 实例（用于反向同步）
  let reactFlowInstance: ReactFlowInstance | null = null;
  
  // 动画帧 ID
  let rafId: number | null = null;
  // 缩放动画状态
  let isZooming = false;
  let zoomVelocity = 0;

  // 通知所有订阅者
  function notifySubscribers() {
    subscribers.forEach((callback) => callback(currentViewport));
  }

  // 更新 viewport（内部使用）
  function updateViewport(newViewport: Viewport, silent = false) {
    const clamped = clampViewport(newViewport, minZoom, maxZoom);
    if (!isSameViewport(currentViewport, clamped)) {
      currentViewport = clamped;
      if (!silent) {
        notifySubscribers();
      }
      // 同步到 3D 场景
      syncTo3DScene();
    }
  }

  // 同步到 3D 场景
  function syncTo3DScene() {
    if (!orbitControls) return;
    
    // 计算 3D target 位置（2D viewport x,y 的反向映射）
    // 当 2D 画布向左移动（x 减小），3D 相机应该向右看
    const targetX = -currentViewport.x * scenePanSensitivity / currentViewport.zoom;
    const targetY = currentViewport.y * scenePanSensitivity / currentViewport.zoom;
    
    orbitControls.target.set(targetX, targetY, 0);
    orbitControls.update();
  }

  // 处理滚轮缩放
  function handleWheel(event: WheelEvent) {
    // 如果正在编辑文本，不处理滚轮缩放
    const target = event.target as HTMLElement;
    if (target?.tagName) {
      const isEditable =
        target.tagName.toLowerCase() === 'input' ||
        target.tagName.toLowerCase() === 'textarea' ||
        target.isContentEditable;
      if (isEditable) return;
    }

    event.preventDefault();

    // deltaY < 0 是向上滚，应该放大
    const delta = -event.deltaY * zoomSpeed;
    zoomVelocity = delta;

    if (!isZooming) {
      isZooming = true;
      
      const animate = () => {
        if (Math.abs(zoomVelocity) < 0.001) {
          isZooming = false;
          zoomVelocity = 0;
          return;
        }

        const newZoom = currentViewport.zoom * (1 + zoomVelocity);
        updateViewport({
          ...currentViewport,
          zoom: newZoom,
        });

        // 衰减速度
        zoomVelocity *= 0.85;
        rafId = requestAnimationFrame(animate);
      };
      
      rafId = requestAnimationFrame(animate);
    }
  }

  // 键盘映射
  const keyDirectionMap: Record<string, { x: number; y: number }> = {
    a: { x: 1, y: 0 }, A: { x: 1, y: 0 },
    d: { x: -1, y: 0 }, D: { x: -1, y: 0 },
    w: { x: 0, y: 1 }, W: { x: 0, y: 1 },
    s: { x: 0, y: -1 }, S: { x: 0, y: -1 },
    ArrowUp: { x: 0, y: 1 },
    ArrowDown: { x: 0, y: -1 },
    ArrowLeft: { x: 1, y: 0 },
    ArrowRight: { x: -1, y: 0 },
  };

  // 处理键盘按下
  function handleKeyDown(event: KeyboardEvent) {
    console.log('[PanAndZoom] KeyDown:', event.key, 'target:', (event.target as HTMLElement)?.tagName);
    
    // 检查是否是 Ctrl + Arrow Keys（在编辑状态下也可用）
    const isCtrlArrow = event.ctrlKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
    
    // 如果不是 Ctrl + Arrow Keys，且编辑区聚焦则不响应
    if (!isCtrlArrow) {
      const target = event.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isEditable) {
        console.log('[PanAndZoom] Ignoring - editable target');
        return;
      }
    }

    const dir = keyDirectionMap[event.key];
    if (!dir) {
      console.log('[PanAndZoom] No direction mapping for key:', event.key);
      return;
    }

    console.log('[PanAndZoom] Starting pan, dir:', dir);
    
    // 更新方向
    if (dir.x !== 0 && inertialState.directionX !== dir.x) {
      inertialState.directionX = dir.x;
    }
    if (dir.y !== 0 && inertialState.directionY !== dir.y) {
      inertialState.directionY = dir.y;
    }

    if (!rafId) {
      rafId = requestAnimationFrame(animatePan);
    }
    
    event.preventDefault();
  }

  // 处理键盘释放
  function handleKeyUp(event: KeyboardEvent) {
    const dir = keyDirectionMap[event.key];
    if (!dir) return;

    if (dir.x !== 0 && inertialState.directionX === dir.x) {
      inertialState.directionX = 0;
    }
    if (dir.y !== 0 && inertialState.directionY === dir.y) {
      inertialState.directionY = 0;
    }
  }

  // 平移动画循环
  function animatePan() {
    const { velocityX, velocityY, directionX, directionY } = inertialState;
    
    let newVelocityX = velocityX;
    let newVelocityY = velocityY;

    // 速度衰减系数（键盘释放后的滑行阻力）
    const friction = 0.5;         // 增加衰减
    const stopThreshold = 0.1;

    // 更新 X 方向速度
    if (directionX !== 0) {
      newVelocityX += panAcceleration * directionX;
      if (Math.abs(newVelocityX) > panMaxSpeed) {
        newVelocityX = panMaxSpeed * directionX;
      }
    } else {
      // 应用衰减
      newVelocityX *= (1 - friction);
      if (Math.abs(newVelocityX) < stopThreshold) newVelocityX = 0;
    }

    // 更新 Y 方向速度
    if (directionY !== 0) {
      newVelocityY += panAcceleration * directionY;
      if (Math.abs(newVelocityY) > panMaxSpeed) {
        newVelocityY = panMaxSpeed * directionY;
      }
    } else {
      // 应用衰减
      newVelocityY *= (1 - friction);
      if (Math.abs(newVelocityY) < stopThreshold) newVelocityY = 0;
    }

    inertialState.velocityX = newVelocityX;
    inertialState.velocityY = newVelocityY;

    // 应用位移（根据当前 zoom 调整速度，保持视觉一致）
    if (newVelocityX !== 0 || newVelocityY !== 0) {
      // zoom 越大，移动越慢（像素级移动）
      const speedFactor = Math.max(0.2, 0.5 / currentViewport.zoom);
      updateViewport({
        x: currentViewport.x + newVelocityX * speedFactor,
        y: currentViewport.y + newVelocityY * speedFactor,
        zoom: currentViewport.zoom,
      });
    }

    // 继续动画或停止
    if (
      newVelocityX !== 0 ||
      newVelocityY !== 0 ||
      directionX !== 0 ||
      directionY !== 0
    ) {
      rafId = requestAnimationFrame(animatePan);
    } else {
      rafId = null;
    }
  }

  // 从 ReactFlow 反向同步 viewport
  function syncFromReactFlow() {
    if (!reactFlowInstance) return;
    
    const rfViewport = reactFlowInstance.getViewport();
    if (!isSameViewport(currentViewport, rfViewport)) {
      // 静默更新，不触发订阅者（避免循环）
      updateViewport(rfViewport, true);
      notifySubscribers();
    }
  }

  // 公共 API
  const api: PanAndZoomControlRef = {
    getViewport: () => currentViewport,
    
    setViewport: (viewport: Viewport) => {
      updateViewport(viewport);
    },
    
    setOrbitControls: (controls: OrbitControlsLike | null) => {
      orbitControls = controls;
      if (controls) {
        syncTo3DScene();
      }
    },
  };

  // 内部方法（用于与 ReactFlow 集成）
  const internalApi = {
    setReactFlowInstance: (instance: ReactFlowInstance | null) => {
      reactFlowInstance = instance;
    },
    
    subscribe: (callback: (viewport: Viewport) => void) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    
    getState: () => currentViewport,
    
    // 事件处理器
    handleWheel,
    handleKeyDown,
    handleKeyUp,
    syncFromReactFlow,
    
    // 清理
    dispose: () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      subscribers.clear();
    },
  };

  return { api, internalApi };
}

// 全局弱引用存储（用于非 React 环境或跨组件共享）
const controlInstances = new WeakMap<object, ReturnType<typeof createPanAndZoomControl>>();

/**
 * React Hook: usePanAndZoomControl
 * 
 * 统一的相机控制钩子，接管除旋转外的所有相机操作。
 */
export function usePanAndZoomControl(
  options: PanAndZoomControlOptions = {}
) {
  // 使用 ref 保持控制器实例稳定
  const controlRef = useRef<ReturnType<typeof createPanAndZoomControl> | null>(null);
  
  if (!controlRef.current) {
    controlRef.current = createPanAndZoomControl(options);
  }
  
  const { api, internalApi } = controlRef.current;

  // 使用 useSyncExternalStore 订阅 viewport 变化
  const viewport = useSyncExternalStore(
    internalApi.subscribe,
    internalApi.getState,
    internalApi.getState
  );

  // 组件挂载时添加事件监听
  useEffect(() => {
    window.addEventListener('wheel', internalApi.handleWheel, { passive: false });
    window.addEventListener('keydown', internalApi.handleKeyDown);
    window.addEventListener('keyup', internalApi.handleKeyUp);

    return () => {
      window.removeEventListener('wheel', internalApi.handleWheel);
      window.removeEventListener('keydown', internalApi.handleKeyDown);
      window.removeEventListener('keyup', internalApi.handleKeyUp);
      internalApi.dispose();
    };
  }, []);

  // 提供给外部使用的 API
  return {
    /** 当前 viewport 状态 */
    viewport,
    /** 获取 viewport 值（用于回调中） */
    getViewport: api.getViewport,
    /** 设置 viewport */
    setViewport: api.setViewport,
    /** 设置 OrbitControls 引用（用于 3D 场景同步） */
    setOrbitControls: api.setOrbitControls,
    /** 设置 ReactFlow 实例（用于反向同步） */
    setReactFlowInstance: internalApi.setReactFlowInstance,
    /** 手动从 ReactFlow 同步（用于 onMoveEnd 等场景） */
    syncFromReactFlow: internalApi.syncFromReactFlow,
    /** 当前缩放值 */
    zoom: viewport.zoom,
    /** 3D 场景缩放系数（同向） */
    sceneScale: viewport.zoom,
  };
}

export default usePanAndZoomControl;
