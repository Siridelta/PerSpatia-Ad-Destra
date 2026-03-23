/**
 * useCameraControl - 统一相机控制 Hook
 *
 * 物理架构：双系统叠加模型（Offset + Velocity）
 * ============================================================================
 *
 * 【Offset 系统】- 用于鼠标拖拽（平移和旋转）
 *   - 记录指针在上一次事件时的位置，计算与当前位置的差值
 *   - 平移：平面坐标差 → panOffset.desired
 *   - 旋转：屏幕坐标差 → rotateOffset.desired
 *   - 每帧指数逼近：current += (desired - current) * (1 - damping)
 *   - 松手：最后的 delta 传给 velocity，然后重置
 *
 * 【Velocity 系统】- 用于键盘和惯性
 *   - panVelocity: 键盘 WASD 控制 desired，松手继承 offset 的惯性
 *   - rotateVelocity: 目前无键盘控制（desired 始终为 0），松手继承 offset 的惯性
 *   - 每帧：current += (desired - current) * (1 - damping) 或直接衰减
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Viewport } from '@xyflow/react';
import type { CameraState } from '../utils/coordinateTransform';

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
  rotateDamping?: number;
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
  rotateDamping: 0.9,
  zoomDamping: 0.88,
};

export function useCameraControl(
  options: Options = {},
  viewportSize: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight }
) {
  // ===== 配置 =====
  const cfgRef = useRef({ ...DEFAULT, ...options });
  const viewportSizeRef = useRef(viewportSize);

  // 当 options 变化时更新配置
  useEffect(() => {
    cfgRef.current = { ...DEFAULT, ...options };
  }, [options]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize.width, viewportSize.height]);

  // ===== React State =====
  const [state, setState] = useState<CameraState>(() => ({
    targetX: cfgRef.current.initialTargetX,
    targetY: cfgRef.current.initialTargetY,
    radius: cfgRef.current.initialRadius,
    theta: cfgRef.current.initialTheta,
    phi: cfgRef.current.initialPhi,
  }));
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ===== Input 状态 =====
  const input = useRef({
    keys: new Set<string>(),
    isPanning: false,
    isRotating: false,
    // 上次指针位置（屏幕坐标 + 平面坐标）
    lastPointer: {
      screen: { x: 0, y: 0 },
      plane: { x: 0, y: 0 },
    },
  });

  // ===== Pan Offset 系统（鼠标拖拽平移）=====
  const panOffset = useRef({
    desired: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
    lastDelta: { x: 0, y: 0 }, // 用于松手时的惯性传递
  });

  // ===== Rotate Offset 系统（鼠标拖拽旋转）=====
  const rotateOffset = useRef({
    desired: { theta: 0, phi: 0 },
    current: { theta: 0, phi: 0 },
    lastDelta: { theta: 0, phi: 0 },
  });

  // ===== Pan Velocity 系统（键盘 WASD + 惯性）=====
  const panVelocity = useRef({
    desired: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
  });

  // ===== Rotate Velocity 系统（惯性，暂无键盘控制）=====
  const rotateVelocity = useRef({
    desired: { theta: 0, phi: 0 },
    current: { theta: 0, phi: 0 },
  });

  // ===== 缩放目标 =====
  const targetRadius = useRef(cfgRef.current.initialRadius);

  // ===== RAF =====
  const rafId = useRef<number | null>(null);

  // ===== 模拟相机（用于 raycast）=====
  const simulatedCamera = useRef<THREE.PerspectiveCamera | null>(null);
  if (!simulatedCamera.current) {
    simulatedCamera.current = new THREE.PerspectiveCamera(50, viewportSize.width / viewportSize.height, 0.1, 1000);
  }
  const xyPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  // ===== 工具函数 =====
  const updateSimulatedCamera = (camState: CameraState) => {
    const camera = simulatedCamera.current;
    if (!camera) return;
    const { targetX, targetY, radius, theta, phi } = camState;
    camera.position.x = targetX + radius * Math.sin(-theta) * Math.cos(phi);
    camera.position.y = targetY + radius * Math.sin(phi);
    camera.position.z = radius * Math.cos(-theta) * Math.cos(phi);
    camera.lookAt(targetX, targetY, 0);
    camera.updateMatrixWorld();
  };

  const screenToPlane = (screenX: number, screenY: number, camState: CameraState) => {
    const camera = simulatedCamera.current;
    if (!camera) return null;
    updateSimulatedCamera(camState);
    const mouse = new THREE.Vector2(
      (screenX / viewportSizeRef.current.width) * 2 - 1,
      -(screenY / viewportSizeRef.current.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const target = new THREE.Vector3();
    return raycaster.ray.intersectPlane(xyPlane.current, target)
      ? { x: target.x, y: target.y }
      : null;
  };

  // ===== RAF 物理循环 =====
  const tick = useCallback(() => {
    const { keys, isPanning, isRotating } = input.current;
    const cfg = cfgRef.current; // 每帧获取最新配置

    setState((prev) => {
      let { targetX, targetY, radius, theta, phi } = prev;

      // ===== Pan Offset 系统（拖拽期）=====
      if (isPanning) {
        const dx = (panOffset.current.desired.x - panOffset.current.current.x) * (1 - cfg.panDamping);
        const dy = (panOffset.current.desired.y - panOffset.current.current.y) * (1 - cfg.panDamping);

        panOffset.current.current.x += dx;
        panOffset.current.current.y += dy;
        panOffset.current.lastDelta = { x: dx, y: dy };

        targetX += dx;
        targetY += dy;
      }

      // ===== Rotate Offset 系统（拖拽期）=====
      if (isRotating) {
        const dTheta = (rotateOffset.current.desired.theta - rotateOffset.current.current.theta) * (1 - cfg.rotateDamping);
        const dPhi = (rotateOffset.current.desired.phi - rotateOffset.current.current.phi) * (1 - cfg.rotateDamping);

        rotateOffset.current.current.theta += dTheta;
        rotateOffset.current.current.phi += dPhi;
        rotateOffset.current.lastDelta = { theta: dTheta, phi: dPhi };

        theta += dTheta;
        phi += dPhi;
        phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, phi));
      }

      // ===== Pan Velocity 系统（键盘 + 惯性）=====
      // 键盘控制 desired velocity
      let targetVx = 0, targetVy = 0;
      if (keys.has('w')) targetVy += 2;
      if (keys.has('s')) targetVy -= 2;
      if (keys.has('a')) targetVx -= 2;
      if (keys.has('d')) targetVx += 2;

      panVelocity.current.desired.x = targetVx;
      panVelocity.current.desired.y = targetVy;

      // 指数逼近 desired
      panVelocity.current.current.x += (panVelocity.current.desired.x - panVelocity.current.current.x) * (1 - cfg.panDamping);
      panVelocity.current.current.y += (panVelocity.current.desired.y - panVelocity.current.current.y) * (1 - cfg.panDamping);

      targetX += panVelocity.current.current.x;
      targetY += panVelocity.current.current.y;

      // 速度极小时归零
      if (Math.abs(panVelocity.current.current.x) < 0.01) panVelocity.current.current.x = 0;
      if (Math.abs(panVelocity.current.current.y) < 0.01) panVelocity.current.current.y = 0;

      // ===== Rotate Velocity 系统（惯性，暂无键盘）=====
      if (!isRotating) {
        // desired 始终为 0，直接指数衰减
        rotateVelocity.current.current.theta += (rotateVelocity.current.desired.theta - rotateVelocity.current.current.theta) * (1 - cfg.rotateDamping);
        rotateVelocity.current.current.phi += (rotateVelocity.current.desired.phi - rotateVelocity.current.current.phi) * (1 - cfg.rotateDamping);

        if (Math.abs(rotateVelocity.current.current.theta) < 0.001) rotateVelocity.current.current.theta = 0;
        if (Math.abs(rotateVelocity.current.current.phi) < 0.001) rotateVelocity.current.current.phi = 0;

        theta += rotateVelocity.current.current.theta;
        phi += rotateVelocity.current.current.phi;
        phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, phi));
      }

      // ===== 缩放系统 =====
      const diff = targetRadius.current - radius;
      if (Math.abs(diff) > 0.01) {
        radius += diff * (1 - cfg.zoomDamping);
      } else {
        radius = targetRadius.current;
      }
      radius = Math.max(cfg.minRadius, Math.min(cfg.maxRadius, radius));

      return { targetX, targetY, radius, theta, phi };
    });

    // 继续或停止判断
    const hasPanOffset = Math.abs(panOffset.current.desired.x - panOffset.current.current.x) > 0.01
                      || Math.abs(panOffset.current.desired.y - panOffset.current.current.y) > 0.01;
    const hasRotateOffset = Math.abs(rotateOffset.current.desired.theta - rotateOffset.current.current.theta) > 0.001
                         || Math.abs(rotateOffset.current.desired.phi - rotateOffset.current.current.phi) > 0.001;
    const hasPanVelocity = Math.abs(panVelocity.current.current.x) > 0.01
                        || Math.abs(panVelocity.current.current.y) > 0.01;
    const hasRotateVelocity = Math.abs(rotateVelocity.current.current.theta) > 0.001
                           || Math.abs(rotateVelocity.current.current.phi) > 0.001;
    const hasZoom = Math.abs(targetRadius.current - stateRef.current.radius) > 0.01;

    if (hasPanOffset || hasRotateOffset || hasPanVelocity || hasRotateVelocity || hasZoom 
        || input.current.isPanning || input.current.isRotating || input.current.keys.size > 0) {
      rafId.current = requestAnimationFrame(tick);
    } else {
      rafId.current = null;
    }
  }, []); // 使用 cfgRef.current 获取最新配置，无需依赖

  const startAnim = useCallback(() => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  // ===== 事件处理器 =====

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      input.current.keys.add(key);
      startAnim();
      e.preventDefault();
    }
  }, [startAnim]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    input.current.keys.delete(e.key.toLowerCase());
  }, []);

  const startPan = useCallback((clientX: number, clientY: number) => {
    const startState = stateRef.current;
    input.current.isPanning = true;
    
    // 记录当前指针的屏幕坐标和平面坐标
    const planePoint = screenToPlane(clientX, clientY, startState);
    input.current.lastPointer = {
      screen: { x: clientX, y: clientY },
      plane: planePoint || { x: 0, y: 0 },
    };
    
    // 重置 offset 系统
    panOffset.current.desired = { x: 0, y: 0 };
    panOffset.current.current = { x: 0, y: 0 };
    panOffset.current.lastDelta = { x: 0, y: 0 };
    
    startAnim();
  }, [startAnim]);

  const startRotate = useCallback((clientX: number, clientY: number) => {
    input.current.isRotating = true;
    input.current.lastPointer.screen = { x: clientX, y: clientY };
    
    // 重置 rotate offset
    rotateOffset.current.desired = { theta: 0, phi: 0 };
    rotateOffset.current.current = { theta: 0, phi: 0 };
    rotateOffset.current.lastDelta = { theta: 0, phi: 0 };
    
    startAnim();
  }, [startAnim]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const { isPanning, isRotating, lastPointer } = input.current;
    
    if (isRotating) {
      // 计算屏幕坐标差，累加到 desired offset
      const dx = e.clientX - lastPointer.screen.x;
      const dy = e.clientY - lastPointer.screen.y;
      
      rotateOffset.current.desired.theta += dx * 0.005;
      rotateOffset.current.desired.phi += dy * 0.005;
      
      // 更新 lastPointer
      lastPointer.screen.x = e.clientX;
      lastPointer.screen.y = e.clientY;
      
      if (!rafId.current) startAnim();
    } else if (isPanning) {
      // 计算当前鼠标在平面上的位置
      const currentPlane = screenToPlane(e.clientX, e.clientY, stateRef.current);
      if (currentPlane) {
        // delta = last - current（相反数）
        const dx = lastPointer.plane.x - currentPlane.x;
        const dy = lastPointer.plane.y - currentPlane.y;
        
        // 累加到 desired offset
        panOffset.current.desired.x += dx;
        panOffset.current.desired.y += dy;
        
        // 更新 lastPointer
        lastPointer.plane = currentPlane;
        lastPointer.screen.x = e.clientX;
        lastPointer.screen.y = e.clientY;
      }
      if (!rafId.current) startAnim();
    }
  }, [startAnim]);

  const handlePointerUp = useCallback(() => {
    const { isPanning, isRotating } = input.current;
    
    if (isPanning) {
      // 松手：offset 的末速度传给 velocity
      panVelocity.current.current.x += panOffset.current.lastDelta.x;
      panVelocity.current.current.y += panOffset.current.lastDelta.y;
      
      // 重置 offset 系统
      panOffset.current.desired = { x: 0, y: 0 };
      panOffset.current.current = { x: 0, y: 0 };
      panOffset.current.lastDelta = { x: 0, y: 0 };
      
      input.current.isPanning = false;
    }
    
    if (isRotating) {
      // 旋转同理
      rotateVelocity.current.current.theta += rotateOffset.current.lastDelta.theta;
      rotateVelocity.current.current.phi += rotateOffset.current.lastDelta.phi;
      
      // 重置 rotate offset
      rotateOffset.current.desired = { theta: 0, phi: 0 };
      rotateOffset.current.current = { theta: 0, phi: 0 };
      rotateOffset.current.lastDelta = { theta: 0, phi: 0 };
      
      input.current.isRotating = false;
    }
    
    startAnim();
  }, [startAnim]);

  const handleWheel = useCallback((e: WheelEvent) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const cfg = cfgRef.current; // 获取最新配置
    targetRadius.current = Math.max(cfg.minRadius, Math.min(cfg.maxRadius, targetRadius.current * delta));
    startAnim();
    // 仅当在 canvas 或相关区域滚动时阻止默认行为，避免影响整个页面的滚动
    if (target.tagName?.toLowerCase() === 'canvas' || (target.closest && target.closest('.react-flow'))) {
      e.preventDefault();
    }
  }, [startAnim]);

  // ===== 同步 =====
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

  const setCameraState = useCallback((newState: CameraState) => {
    stateRef.current = newState;
    setState(newState);
    targetRadius.current = newState.radius;
  }, []);

  // ===== Derived =====
  const viewport: Viewport = {
    x: -state.targetX,
    y: state.targetY,
    zoom: 30 / state.radius,
  };

  // ===== 注册全局事件监听器 =====
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [handleKeyDown, handleKeyUp, handleWheel]);

  // ===== viewportSize 变化时更新相机 aspect =====
  useEffect(() => {
    if (simulatedCamera.current) {
      simulatedCamera.current.aspect = viewportSize.width / viewportSize.height;
      simulatedCamera.current.updateProjectionMatrix();
    }
  }, [viewportSize.width, viewportSize.height]);

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
