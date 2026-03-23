/**
 * useCameraControl - 统一相机控制 Hook
 * 
 * 职责：
 * 1. 维护相机状态 (targetX, targetY, radius, theta, phi)
 * 2. 处理所有输入事件（键盘、鼠标、滚轮）
 * 3. 统一物理系统（指数逼近 + 指数衰减）
 * 4. 提供 viewport 转换（兼容 ReactFlow）
 * 5. 支持双向同步（从 ReactFlow 视口反向同步）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport } from '@xyflow/react';
import type { CameraState } from '../utils/coordinateTransform';

// 配置选项
export interface CameraControlOptions {
  initialTargetX?: number;
  initialTargetY?: number;
  initialRadius?: number;
  initialTheta?: number;
  initialPhi?: number;
  
  minRadius?: number;
  maxRadius?: number;
  
  panDamping?: number;
  panMaxSpeed?: number;
  
  rotateDamping?: number;
  rotateMaxSpeed?: number;
  
  zoomDamping?: number;
  zoomSpeed?: number;
}

// 物理速度状态
interface VelocityState {
  vx: number;
  vy: number;
  vTheta: number;
  vPhi: number;
}

// 输入状态
interface InputState {
  keys: Set<string>;
  isPanning: boolean;
  isRotating: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

const DEFAULT_OPTIONS: Required<CameraControlOptions> = {
  initialTargetX: 0,
  initialTargetY: 0,
  initialRadius: 30,
  initialTheta: 0,
  initialPhi: 0,
  
  minRadius: 5,
  maxRadius: 100,
  
  panDamping: 0.92,
  panMaxSpeed: 2,
  
  rotateDamping: 0.9,
  rotateMaxSpeed: 0.02,
  
  zoomDamping: 0.88,
  zoomSpeed: 0.5,
};

export function useCameraControl(options: CameraControlOptions = {}) {
  const configRef = useRef({ ...DEFAULT_OPTIONS, ...options });
  const config = configRef.current;
  
  // 相机状态
  const [cameraState, setCameraState] = useState<CameraState>({
    targetX: config.initialTargetX,
    targetY: config.initialTargetY,
    radius: config.initialRadius,
    theta: config.initialTheta,
    phi: config.initialPhi,
  });
  
  // 使用 ref 存储状态，避免闭包问题
  const cameraStateRef = useRef(cameraState);
  useEffect(() => {
    cameraStateRef.current = cameraState;
  }, [cameraState]);
  
  // 物理速度（用 ref 避免重渲染）
  const velocityRef = useRef<VelocityState>({
    vx: 0, vy: 0, vTheta: 0, vPhi: 0
  });
  
  // 输入状态
  const inputRef = useRef<InputState>({
    keys: new Set(),
    isPanning: false,
    isRotating: false,
    lastMouseX: 0,
    lastMouseY: 0,
  });
  
  // RAF ID
  const rafRef = useRef<number | null>(null);
  
  // 目标 radius（用于滚轮缩放）
  const targetRadiusRef = useRef(config.initialRadius);
  
  // 计算 ReactFlow viewport（从相机状态）
  const viewport: Viewport = {
    x: -cameraState.targetX,
    y: cameraState.targetY,
    zoom: 30 / cameraState.radius,
  };
  
  // 计算 sceneScale（与旧版兼容）
  const sceneScale = viewport.zoom;
  
  // 帧计数器（用于调试）
  const frameCountRef = useRef(0);
  
  // 物理更新循环 - 使用 ref 避免闭包问题
  const updatePhysicsRef = useRef<() => void>();
  
  updatePhysicsRef.current = () => {
    const input = inputRef.current;
    const velocity = velocityRef.current;
    let hasChanged = false;
    
    setCameraState(prev => {
      let { targetX, targetY, radius, theta, phi } = prev;
      
      // ===== 平移物理 (WASD + 鼠标拖拽) =====
      let targetVx = 0;
      let targetVy = 0;
      
      if (input.keys.has('w') || input.keys.has('W')) targetVy += config.panMaxSpeed;
      if (input.keys.has('s') || input.keys.has('S')) targetVy -= config.panMaxSpeed;
      if (input.keys.has('a') || input.keys.has('A')) targetVx -= config.panMaxSpeed;
      if (input.keys.has('d') || input.keys.has('D')) targetVx += config.panMaxSpeed;
      
      if (targetVx !== 0 || targetVy !== 0) {
        // 键盘输入：指数逼近目标速度
        velocity.vx += (targetVx - velocity.vx) * (1 - config.panDamping);
        velocity.vy += (targetVy - velocity.vy) * (1 - config.panDamping);
        targetX += velocity.vx;
        targetY += velocity.vy;
        hasChanged = true;
      } else if (input.isPanning) {
        // 拖拽中：由 handlePointerMove 直接修改状态，这里只确保 RAF 继续运行
        hasChanged = true;
      } else {
        // 惯性滑行 - 衰减速度
        velocity.vx *= config.panDamping;
        velocity.vy *= config.panDamping;
        
        if (Math.abs(velocity.vx) > 0.01) {
          targetX += velocity.vx;
          hasChanged = true;
        } else {
          velocity.vx = 0;
        }
        if (Math.abs(velocity.vy) > 0.01) {
          targetY += velocity.vy;
          hasChanged = true;
        } else {
          velocity.vy = 0;
        }
      }
      
      // ===== 旋转物理 (右键拖拽) =====
      if (!input.isRotating) {
        velocity.vTheta *= config.rotateDamping;
        velocity.vPhi *= config.rotateDamping;
        if (Math.abs(velocity.vTheta) < 0.001) velocity.vTheta = 0;
        if (Math.abs(velocity.vPhi) < 0.001) velocity.vPhi = 0;
      }
      
      if (velocity.vTheta !== 0 || velocity.vPhi !== 0) {
        theta += velocity.vTheta;
        phi += velocity.vPhi;
        phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, phi));
        hasChanged = true;
      }
      
      // ===== 缩放物理 (滚轮) =====
      const targetRadius = targetRadiusRef.current;
      const radiusDiff = targetRadius - radius;
      
      if (Math.abs(radiusDiff) > 0.01) {
        radius += radiusDiff * (1 - config.zoomDamping);
        hasChanged = true;
      } else {
        radius = targetRadius;
      }
      
      radius = Math.max(config.minRadius, Math.min(config.maxRadius, radius));
      
      return { targetX, targetY, radius, theta, phi };
    });
    
    // 检查是否需要继续动画 - 使用 velocity 的实时值，不依赖 hasChanged
    const hasInertia = Math.abs(velocity.vx) > 0.01 || Math.abs(velocity.vy) > 0.01 ||
                       Math.abs(velocity.vTheta) > 0.001 || Math.abs(velocity.vPhi) > 0.001;
    const hasZoom = Math.abs(targetRadiusRef.current - cameraStateRef.current.radius) > 0.01;
    const shouldContinue = hasInertia || hasZoom || input.keys.size > 0 || input.isPanning || input.isRotating;
    
    if (shouldContinue) {
      rafRef.current = requestAnimationFrame(updatePhysicsRef.current!);
    } else {
      rafRef.current = null;
    }
  };
  
  // 启动动画循环
  const startAnimation = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => updatePhysicsRef.current!());
    }
  }, []);
  
  // ===== 事件处理器 =====
  
  // 键盘按下
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (['input', 'textarea'].includes(target.tagName?.toLowerCase())) return;
    
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      inputRef.current.keys.add(key);
      startAnimation();
      e.preventDefault();
    }
  }, [startAnimation]);
  
  // 键盘释放
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    inputRef.current.keys.delete(key);
  }, []);
  
  // 开始平移
  const startPan = useCallback((clientX: number, clientY: number) => {
  
    inputRef.current.isPanning = true;
    inputRef.current.lastMouseX = clientX;
    inputRef.current.lastMouseY = clientY;
    startAnimation();
  }, [startAnimation]);
  
  // 开始旋转
  const startRotate = useCallback((clientX: number, clientY: number) => {

    inputRef.current.isRotating = true;
    inputRef.current.lastMouseX = clientX;
    inputRef.current.lastMouseY = clientY;
    startAnimation();
  }, [startAnimation]);
  
  // 指针移动 - 直接修改 target，不经过 velocity（velocity 只用于惯性）
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const input = inputRef.current;
    const velocity = velocityRef.current;
    
    const dx = e.clientX - input.lastMouseX;
    const dy = e.clientY - input.lastMouseY;
    
    if (input.isRotating) {
      velocity.vTheta = dx * 0.005;
      velocity.vPhi = dy * 0.005;
    } else if (input.isPanning) {
      // 左键拖拽 = 直接修改 cameraState，不经过 velocity
      const cosTheta = Math.cos(cameraStateRef.current.theta);
      const deltaX = -dx * cosTheta;
      const deltaY = dy;
      
      // 保存最后一次 delta 用于松手后的惯性
      velocity.vx = deltaX;
      velocity.vy = deltaY;
      

      
      // 直接更新状态
      setCameraState(prev => ({
        ...prev,
        targetX: prev.targetX + deltaX,
        targetY: prev.targetY + deltaY,
      }));
      
      if (!rafRef.current) {
        startAnimation();
      }
    }
    
    input.lastMouseX = e.clientX;
    input.lastMouseY = e.clientY;
  }, [startAnimation]);
  
  // 指针释放
  const handlePointerUp = useCallback(() => {
    const input = inputRef.current;
    
    // 只有真正从拖拽状态释放时才处理
    if (input.isPanning || input.isRotating) {
      input.isPanning = false;
      input.isRotating = false;
      startAnimation();
    }
  }, [startAnimation]);
  
  // 滚轮缩放
  const handleWheel = useCallback((e: WheelEvent) => {
    const target = e.target as HTMLElement;
    if (['input', 'textarea'].includes(target.tagName?.toLowerCase())) return;
    
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    targetRadiusRef.current *= delta;
    targetRadiusRef.current = Math.max(
      config.minRadius,
      Math.min(config.maxRadius, targetRadiusRef.current)
    );
    
    startAnimation();
    e.preventDefault();
  }, [config.minRadius, config.maxRadius, startAnimation]);
  
  // 从 ReactFlow viewport 反向同步
  const syncFromViewport = useCallback((viewport: Viewport) => {
    setCameraState({
      targetX: -viewport.x,
      targetY: viewport.y,
      radius: 30 / viewport.zoom,
      theta: cameraStateRef.current.theta,
      phi: cameraStateRef.current.phi,
    });
    targetRadiusRef.current = 30 / viewport.zoom;
  }, []);
  
  // 设置相机状态（外部调用）
  const setCameraStateExternal = useCallback((newState: CameraState) => {
    cameraStateRef.current = newState;
    setCameraState(newState);
    targetRadiusRef.current = newState.radius;
  }, []);
  
  // 清理
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);
  
  return {
    // 状态
    cameraState,
    viewport,
    sceneScale,
    
    // 设置
    setCameraState: setCameraStateExternal,
    
    // 同步
    syncFromViewport,
    
    // 事件处理器
    handlers: {
      handleKeyDown,
      handleKeyUp,
      handlePointerMove,
      handlePointerUp,
      handleWheel,
      startPan,
      startRotate,
    },
  };
}

export default useCameraControl;
