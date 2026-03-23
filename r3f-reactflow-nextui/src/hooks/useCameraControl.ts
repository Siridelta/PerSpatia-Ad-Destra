/**
 * useCameraControl - 统一相机控制 Hook
 *
 * 职责：
 * 1. 维护相机状态 (targetX, targetY, radius, theta, phi)
 * 2. 处理所有输入事件（键盘、鼠标、滚轮）
 * 3. 统一物理系统（指数逼近 + 指数衰减）
 * 4. 提供 viewport 转换（兼容 ReactFlow）
 * 5. 支持双向同步（从 ReactFlow 视口反向同步）
 *
 * 物理模型：
 * - 拖拽时：直接位置/角度映射（鼠标不动则场景不动）
 * - 松手后：速度指数衰减产生惯性滑行
 * - 键盘：指数逼近目标速度
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Viewport } from '@xyflow/react';
import type { CameraState } from '../utils/coordinateTransform';
import { screenToWorldFromState } from '../utils/coordinateTransform';

// 配置选项
interface Options {
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
}

const DEFAULT: Required<Options> = {
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
};

export function useCameraControl(
  options: Options = {},
  viewportSize: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight }
) {
  const cfgRef = useRef({ ...DEFAULT, ...options });
  const cfg = cfgRef.current;

  const [state, setState] = useState<CameraState>({
    targetX: cfg.initialTargetX,
    targetY: cfg.initialTargetY,
    radius: cfg.initialRadius,
    theta: cfg.initialTheta,
    phi: cfg.initialPhi,
  });

  // 使用 ref 存储状态，避免闭包问题
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // 物理速度（用 ref 避免重渲染）
  const velocity = useRef({ x: 0, y: 0, theta: 0, phi: 0 });
  // 目标 radius（用于滚轮缩放）
  const targetRadius = useRef(cfg.initialRadius);
  // RAF ID
  const rafId = useRef<number | null>(null);

  const input = useRef({
    keys: new Set<string>(),
    isPanning: false,
    isRotating: false,
    lastX: 0,
    lastY: 0,
    // 拖拽起始状态（用于基于固定相机的计算）
    startState: null as CameraState | null,
    startScreen: { x: 0, y: 0 },
    // Raycast 抓点
    grabPoint: null as { x: number; y: number } | null,
  });

  // 幽灵相机 - 只用于 raycast 计算，不挂载到场景
  const ghostCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  if (!ghostCameraRef.current) {
    ghostCameraRef.current = new THREE.PerspectiveCamera(50, viewportSize.width / viewportSize.height, 0.1, 1000);
  }
  
  // XY 平面用于 raycast
  const xyPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  // 计算 ReactFlow viewport（从相机状态）
  const viewport: Viewport = {
    x: -state.targetX,
    y: state.targetY,
    zoom: 30 / state.radius,
  };

  // 物理更新循环
  const tick = useCallback(() => {
    const { keys, isPanning, isRotating } = input.current;
    const v = velocity.current;

    setState((prev) => {
      let { targetX, targetY, radius, theta, phi } = prev;

      // ===== 平移物理 (WASD + 鼠标拖拽) =====
      // 键盘输入：指数逼近目标速度
      let targetVx = 0;
      let targetVy = 0;
      if (keys.has('w')) targetVy += cfg.panMaxSpeed;
      if (keys.has('s')) targetVy -= cfg.panMaxSpeed;
      if (keys.has('a')) targetVx -= cfg.panMaxSpeed;
      if (keys.has('d')) targetVx += cfg.panMaxSpeed;

      if (targetVx !== 0 || targetVy !== 0) {
        v.x += (targetVx - v.x) * (1 - cfg.panDamping);
        v.y += (targetVy - v.y) * (1 - cfg.panDamping);
        targetX += v.x;
        targetY += v.y;
      } else if (!isPanning) {
        // 惯性滑行：指数衰减
        v.x *= cfg.panDamping;
        v.y *= cfg.panDamping;
        if (Math.abs(v.x) > 0.01) targetX += v.x;
        else v.x = 0;
        if (Math.abs(v.y) > 0.01) targetY += v.y;
        else v.y = 0;
      }

      // ===== 旋转物理 (右键拖拽) =====
      if (!isRotating) {
        // 惯性滑行（仅在非拖拽时）
        v.theta *= cfg.rotateDamping;
        v.phi *= cfg.rotateDamping;
        if (Math.abs(v.theta) < 0.001) v.theta = 0;
        if (Math.abs(v.phi) < 0.001) v.phi = 0;
        
        if (v.theta !== 0 || v.phi !== 0) {
          theta += v.theta;
          phi += v.phi;
          phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, phi));
        }
      }

      // ===== 缩放物理 (滚轮) =====
      const diff = targetRadius.current - radius;
      if (Math.abs(diff) > 0.01) {
        radius += diff * (1 - cfg.zoomDamping);
      } else {
        radius = targetRadius.current;
      }
      radius = Math.max(cfg.minRadius, Math.min(cfg.maxRadius, radius));

      return { targetX, targetY, radius, theta, phi };
    });

    // 继续动画或停止
    const hasInertia = Math.abs(v.x) > 0.01 || Math.abs(v.y) > 0.01 || Math.abs(v.theta) > 0.001 || Math.abs(v.phi) > 0.001;
    const hasZoom = Math.abs(targetRadius.current - stateRef.current.radius) > 0.01;

    if (hasInertia || hasZoom || keys.size > 0 || isPanning || isRotating) {
      rafId.current = requestAnimationFrame(tick);
    } else {
      rafId.current = null;
    }
  }, [cfg]);

  const startAnim = useCallback(() => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  // ===== 事件处理器 =====
  // 键盘按下
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        input.current.keys.add(key);
        startAnim();
        e.preventDefault();
      }
    },
    [startAnim]
  );

  // 键盘释放
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    input.current.keys.delete(e.key.toLowerCase());
  }, []);

  // 更新幽灵相机位置
  const updateGhostCamera = (camState: CameraState) => {
    const camera = ghostCameraRef.current;
    if (!camera) return;
    
    const { targetX, targetY, radius, theta, phi } = camState;
    camera.position.x = targetX + radius * Math.sin(-theta) * Math.cos(phi);
    camera.position.y = targetY + radius * Math.sin(phi);
    camera.position.z = radius * Math.cos(-theta) * Math.cos(phi);
    camera.lookAt(targetX, targetY, 0);
    camera.updateMatrixWorld();
  };

  // 屏幕坐标 → 世界坐标（使用幽灵相机）
  const screenToWorldWithGhost = (screenX: number, screenY: number, camState: CameraState): { x: number; y: number; z: number } | null => {
    const camera = ghostCameraRef.current;
    if (!camera) return null;
    
    // 更新相机到指定状态
    updateGhostCamera(camState);
    
    // NDC 坐标
    const mouse = new THREE.Vector2(
      (screenX / viewportSize.width) * 2 - 1,
      -(screenY / viewportSize.height) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    const target = new THREE.Vector3();
    const intersected = raycaster.ray.intersectPlane(xyPlaneRef.current, target);
    
    return intersected ? { x: target.x, y: target.y, z: target.z } : null;
  };

  // 开始平移（计算抓点并记录）
  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      const startState = stateRef.current;
      input.current.isPanning = true;
      input.current.lastX = clientX;
      input.current.lastY = clientY;
      input.current.startState = { ...startState };
      input.current.startScreen = { x: clientX, y: clientY };
      
      // 计算抓点：在当前相机状态下，鼠标指向 XY 平面的哪里
      const grab = screenToWorldWithGhost(clientX, clientY, startState);
      input.current.grabPoint = grab ? { x: grab.x, y: grab.y } : null;
      
      startAnim();
    },
    [startAnim]
  );

  // 开始旋转
  const startRotate = useCallback(
    (clientX: number, clientY: number) => {
      input.current.isRotating = true;
      input.current.lastX = clientX;
      input.current.lastY = clientY;
      startAnim();
    },
    [startAnim]
  );

  // 指针移动 - 计算目标位置（拖拽时用指数逼近）
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const { isPanning, isRotating, lastX, lastY, startState, grabPoint } = input.current;
      
      if (isRotating) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const deltaTheta = dx * 0.005;
        const deltaPhi = dy * 0.005;
        velocity.current.theta = deltaTheta;
        velocity.current.phi = deltaPhi;
        setState((prev) => ({
          ...prev,
          theta: prev.theta + deltaTheta,
          phi: Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, prev.phi + deltaPhi)),
        }));
        if (!rafId.current) startAnim();
      } else if (isPanning && grabPoint && startState) {
        // 计算当前鼠标位置在当前相机状态下指向哪里
        const currentPoint = screenToWorldWithGhost(e.clientX, e.clientY, stateRef.current);
        
        if (currentPoint) {
          // 想让 currentPoint 对齐 grabPoint
          // target = startTarget + (grabPoint - currentPoint)
          const targetX = startState.targetX + (grabPoint.x - currentPoint.x);
          const targetY = startState.targetY + (grabPoint.y - currentPoint.y);
          
          // 指数逼近目标（而不是直接设置）
          const dx = targetX - stateRef.current.targetX;
          const dy = targetY - stateRef.current.targetY;
          velocity.current.x = dx * 0.5; // 每帧移动 50%
          velocity.current.y = dy * 0.5;
        }
        
        if (!rafId.current) startAnim();
      }

      input.current.lastX = e.clientX;
      input.current.lastY = e.clientY;
    },
    [startAnim, viewportSize.width, viewportSize.height]
  );

  // 指针释放
  const handlePointerUp = useCallback(() => {
    const { isPanning, isRotating } = input.current;
    if (isPanning || isRotating) {
      input.current.isPanning = false;
      input.current.isRotating = false;
      startAnim(); // 启动惯性滑行
    }
  }, [startAnim]);

  // 滚轮缩放
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const tag = (e.target as HTMLElement).tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      targetRadius.current = Math.max(cfg.minRadius, Math.min(cfg.maxRadius, targetRadius.current * delta));
      startAnim();
      e.preventDefault();
    },
    [cfg.minRadius, cfg.maxRadius, startAnim]
  );

  // 从 ReactFlow viewport 反向同步
  const syncFromViewport = useCallback((vp: Viewport) => {
    setState({
      targetX: -vp.x,
      targetY: vp.y,
      radius: 30 / vp.zoom,
      theta: stateRef.current.theta,
      phi: stateRef.current.phi,
    });
    targetRadius.current = 30 / vp.zoom;
  }, []);

  // 设置相机状态（外部调用）
  const setCameraState = useCallback((newState: CameraState) => {
    stateRef.current = newState;
    setState(newState);
    targetRadius.current = newState.radius;
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return {
    cameraState: state,
    viewport,
    sceneScale: viewport.zoom,
    handlers: {
      handleKeyDown,
      handleKeyUp,
      startPan,
      startRotate,
      handlePointerMove,
      handlePointerUp,
      handleWheel,
    },
    setCameraState,
    syncFromViewport,
  };
}

export default useCameraControl;
