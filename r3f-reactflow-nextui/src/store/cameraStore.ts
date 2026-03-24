import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import * as THREE from 'three';
import type { CameraState } from '../utils/coordinateTransform';

// 启用 Immer 对 Set 的支持
enableMapSet();

// 配置选项
export interface CameraOptions {
  initialTargetX: number;
  initialTargetY: number;
  initialRadius: number;
  initialTheta: number;
  initialPhi: number;
  minRadius: number;
  maxRadius: number;
  panDamping: number;
  rotateDamping: number;
  zoomDamping: number;
}

export const DEFAULT_CAMERA_OPTIONS: CameraOptions = {
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

// 输入状态
interface InputState {
  keys: Set<string>;
  isPanning: boolean;
  isRotating: boolean;
  lastPointerScreen: { x: number; y: number } | null;
}

// 物理系统内部状态
interface PhysicsState {
  panOffset: {
    desired: { x: number; y: number };
    current: { x: number; y: number };
    lastDelta: { x: number; y: number };
  };
  rotateOffset: {
    desired: { theta: number; phi: number };
    current: { theta: number; phi: number };
    lastDelta: { theta: number; phi: number };
  };
  panVelocity: {
    desired: { x: number; y: number };
    current: { x: number; y: number };
  };
  rotateVelocity: {
    desired: { theta: number; phi: number };
    current: { theta: number; phi: number };
  };
  targetRadius: number;
}

// Store 接口
export interface CameraStore {
  // 核心状态
  cameraState: CameraState;
  options: CameraOptions;
  viewportSize: { width: number; height: number };

  // 内部状态（不建议外部直接读取，主要供 tick 使用）
  input: InputState;
  physics: PhysicsState;

  // 模拟相机（用于射线检测）
  simulatedCamera: THREE.PerspectiveCamera;
  xyPlane: THREE.Plane;

  // Actions
  setViewportSize: (width: number, height: number) => void;
  setOptions: (options: Partial<CameraOptions>) => void;
  setCameraState: (state: Partial<CameraState>) => void;
  syncFromReactFlowViewport: (x: number, y: number, zoom: number) => void;

  // Input Actions (Event Capturer 调用)
  handleKeyDown: (key: string) => void;
  handleKeyUp: (key: string) => void;
  startPan: (clientX: number, clientY: number) => void;
  startRotate: (clientX: number, clientY: number) => void;
  handlePointerMove: (clientX: number, clientY: number) => void;
  handlePointerUp: () => void;
  handleWheel: (deltaY: number) => void;

  // Physics Loop (useFrame 调用)
  tick: () => boolean; // 返回 true 表示需要继续动画，false 表示静止

  // 辅助方法
  screenToPlane: (screenX: number, screenY: number) => { x: number; y: number } | null;
  updateSimulatedCamera: () => void;
}

export const useCameraStore = create<CameraStore>()(immer((set, get) => ({
  // 初始状态
  cameraState: {
    targetX: DEFAULT_CAMERA_OPTIONS.initialTargetX,
    targetY: DEFAULT_CAMERA_OPTIONS.initialTargetY,
    radius: DEFAULT_CAMERA_OPTIONS.initialRadius,
    theta: DEFAULT_CAMERA_OPTIONS.initialTheta,
    phi: DEFAULT_CAMERA_OPTIONS.initialPhi,
  },
  options: { ...DEFAULT_CAMERA_OPTIONS },
  viewportSize: { width: window.innerWidth, height: window.innerHeight },

  input: {
    keys: new Set<string>(),
    isPanning: false,
    isRotating: false,
    lastPointerScreen: null,
  },

  physics: {
    panOffset: {
      desired: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
      lastDelta: { x: 0, y: 0 },
    },
    rotateOffset: {
      desired: { theta: 0, phi: 0 },
      current: { theta: 0, phi: 0 },
      lastDelta: { theta: 0, phi: 0 },
    },
    panVelocity: {
      desired: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
    },
    rotateVelocity: {
      desired: { theta: 0, phi: 0 },
      current: { theta: 0, phi: 0 },
    },
    targetRadius: DEFAULT_CAMERA_OPTIONS.initialRadius,
  },

  simulatedCamera: new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000),
  xyPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),

  // Actions
  setViewportSize: (width, height) => {
    const { simulatedCamera } = get();
    // THREE.js 对象直接修改
    simulatedCamera.aspect = width / height;
    simulatedCamera.updateProjectionMatrix();

    set((draft) => {
      draft.viewportSize = { width, height };
    });
  },

  setOptions: (options) => {
    set((draft) => {
      Object.assign(draft.options, options);
    });
  },

  setCameraState: (newState) => {
    set((draft) => {
      Object.assign(draft.cameraState, newState);
      if (newState.radius !== undefined) {
        draft.physics.targetRadius = newState.radius;
      }
    });
  },

  syncFromReactFlowViewport: (x, y, zoom) => {
    set((draft) => {
      const radius = 30 / zoom;
      draft.cameraState.targetX = -x;
      draft.cameraState.targetY = y;
      draft.cameraState.radius = radius;
      draft.physics.targetRadius = radius;
    });
  },

  // 辅助方法
  updateSimulatedCamera: () => {
    const state = get();
    const { cameraState, simulatedCamera } = state;
    const { targetX, targetY, radius, theta, phi } = cameraState;

    simulatedCamera.position.x = targetX + radius * Math.sin(-theta) * Math.cos(phi);
    simulatedCamera.position.y = targetY + radius * Math.sin(phi);
    simulatedCamera.position.z = radius * Math.cos(-theta) * Math.cos(phi);
    simulatedCamera.lookAt(targetX, targetY, 0);
    simulatedCamera.updateMatrixWorld();
  },

  screenToPlane: (screenX, screenY) => {
    const state = get();
    state.updateSimulatedCamera();

    const mouse = new THREE.Vector2(
      (screenX / state.viewportSize.width) * 2 - 1,
      -(screenY / state.viewportSize.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.simulatedCamera);

    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(state.xyPlane, target)) {
      return { x: target.x, y: target.y };
    }
    return null;
  },

  // Input Actions
  handleKeyDown: (key) => {
    const state = get();
    if (['w', 'a', 's', 'd'].includes(key)) {
      // 创建一个新的 Set 以触发可能的订阅（虽然我们主要在 tick 里读它）
      const newKeys = new Set(state.input.keys);
      newKeys.add(key);
      set(draft => {
        draft.input.keys = newKeys;
      });
    }
  },

  handleKeyUp: (key) => {
    const state = get();
    const newKeys = new Set(state.input.keys);
    newKeys.delete(key);
    set(draft => {
      draft.input.keys = newKeys;
    });
  },

  startPan: (clientX, clientY) => {
    set(draft => {
      draft.input.isPanning = true;
      draft.input.lastPointerScreen = { x: clientX, y: clientY };
      draft.physics.panOffset = {
        desired: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        lastDelta: { x: 0, y: 0 },
      };
    });
  },

  startRotate: (clientX, clientY) => {
    set(draft => {
      draft.input.isRotating = true;
      draft.input.lastPointerScreen = { x: clientX, y: clientY };
      draft.physics.rotateOffset = {
        desired: { theta: 0, phi: 0 },
        current: { theta: 0, phi: 0 },
        lastDelta: { theta: 0, phi: 0 },
      };
    });
  },

  handlePointerMove: (clientX, clientY) => {
    const state = get();
    const { input } = state;

    if (!input.lastPointerScreen) return;

    if (input.isRotating) {
      const dx = clientX - input.lastPointerScreen.x;
      const dy = clientY - input.lastPointerScreen.y;

      set(draft => {
        draft.input.lastPointerScreen = { x: clientX, y: clientY };
        draft.physics.rotateOffset.desired.theta += dx * 0.005;
        draft.physics.rotateOffset.desired.phi += dy * 0.005;
      });
    } else if (input.isPanning) {
      const lastPlane = state.screenToPlane(input.lastPointerScreen.x, input.lastPointerScreen.y);
      const currentPlane = state.screenToPlane(clientX, clientY);

      if (currentPlane && lastPlane) {
        const dx = lastPlane.x - currentPlane.x;
        const dy = lastPlane.y - currentPlane.y;

        set(draft => {
          draft.input.lastPointerScreen = { x: clientX, y: clientY };
          draft.physics.panOffset.desired.x += dx;
          draft.physics.panOffset.desired.y += dy;
        });
      }
    }
  },

  handlePointerUp: () => {
    const state = get();
    const { input, physics } = state;
    set(draft => {
      if (input.isPanning) {
        draft.physics.panVelocity.current.x += physics.panOffset.lastDelta.x;
        draft.physics.panVelocity.current.y += physics.panOffset.lastDelta.y;

        draft.physics.panOffset = {
          desired: { x: 0, y: 0 },
          current: { x: 0, y: 0 },
          lastDelta: { x: 0, y: 0 },
        };

        draft.input.isPanning = false;
      }

      if (input.isRotating) {
        draft.physics.rotateVelocity.current.theta += physics.rotateOffset.lastDelta.theta;
        draft.physics.rotateVelocity.current.phi += physics.rotateOffset.lastDelta.phi;

        draft.physics.rotateOffset = {
          desired: { theta: 0, phi: 0 },
          current: { theta: 0, phi: 0 },
          lastDelta: { theta: 0, phi: 0 },
        };

        draft.input.isRotating = false;
      }
      
      draft.input.lastPointerScreen = null;
    });
  },

  handleWheel: (deltaY) => {
    const state = get();
    const delta = deltaY > 0 ? 1.1 : 0.9;
    const { options, physics } = state;

    set(draft => {
      draft.physics.targetRadius = Math.max(options.minRadius, Math.min(options.maxRadius, physics.targetRadius * delta));
    });
  },

  // Physics Loop
  tick: () => {
    const state = get();
    const { input, physics, cameraState } = state;

    // 1. 快速检查是否需要继续动画 (基于当前状态判断)
    const hasPanOffset = Math.abs(physics.panOffset.desired.x - physics.panOffset.current.x) > 0.01
      || Math.abs(physics.panOffset.desired.y - physics.panOffset.current.y) > 0.01;
    const hasRotateOffset = Math.abs(physics.rotateOffset.desired.theta - physics.rotateOffset.current.theta) > 0.001
      || Math.abs(physics.rotateOffset.desired.phi - physics.rotateOffset.current.phi) > 0.001;
    const hasPanVelocity = Math.abs(physics.panVelocity.current.x) > 0.01
      || Math.abs(physics.panVelocity.current.y) > 0.01;
    const hasRotateVelocity = Math.abs(physics.rotateVelocity.current.theta) > 0.001
      || Math.abs(physics.rotateVelocity.current.phi) > 0.001;
    const hasZoom = Math.abs(physics.targetRadius - cameraState.radius) > 0.01;

    const isMoving = hasPanOffset || hasRotateOffset || hasPanVelocity || hasRotateVelocity || hasZoom
      || input.isPanning || input.isRotating || input.keys.size > 0;

    // 如果完全静止，直接退出，不触发任何状态更新
    if (!isMoving) return false;

    // 2. 在 Immer 的 draft 中直接进行计算和赋值
    // 现代设备的性能足以支撑每秒 60 次的 Proxy 操作，换取代码的极高可读性
    set((draft) => {
      const { input: dInput, physics: dPhysics, options: dOptions, cameraState: dCamera } = draft;

      // ===== Pan Offset 系统 =====
      if (dInput.isPanning) {
        const dx = (dPhysics.panOffset.desired.x - dPhysics.panOffset.current.x) * (1 - dOptions.panDamping);
        const dy = (dPhysics.panOffset.desired.y - dPhysics.panOffset.current.y) * (1 - dOptions.panDamping);

        dPhysics.panOffset.current.x += dx;
        dPhysics.panOffset.current.y += dy;
        dPhysics.panOffset.lastDelta = { x: dx, y: dy };

        dCamera.targetX += dx;
        dCamera.targetY += dy;
      }

      // ===== Rotate Offset 系统 =====
      if (dInput.isRotating) {
        const dTheta = (dPhysics.rotateOffset.desired.theta - dPhysics.rotateOffset.current.theta) * (1 - dOptions.rotateDamping);
        const dPhi = (dPhysics.rotateOffset.desired.phi - dPhysics.rotateOffset.current.phi) * (1 - dOptions.rotateDamping);

        dPhysics.rotateOffset.current.theta += dTheta;
        dPhysics.rotateOffset.current.phi += dPhi;
        dPhysics.rotateOffset.lastDelta = { theta: dTheta, phi: dPhi };

        dCamera.theta += dTheta;
        dCamera.phi += dPhi;
        dCamera.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, dCamera.phi));
      }

      // ===== Pan Velocity 系统 =====
      let targetVx = 0, targetVy = 0;
      if (dInput.keys.has('w')) targetVy += 2;
      if (dInput.keys.has('s')) targetVy -= 2;
      if (dInput.keys.has('a')) targetVx -= 2;
      if (dInput.keys.has('d')) targetVx += 2;

      dPhysics.panVelocity.desired.x = targetVx;
      dPhysics.panVelocity.desired.y = targetVy;

      dPhysics.panVelocity.current.x += (dPhysics.panVelocity.desired.x - dPhysics.panVelocity.current.x) * (1 - dOptions.panDamping);
      dPhysics.panVelocity.current.y += (dPhysics.panVelocity.desired.y - dPhysics.panVelocity.current.y) * (1 - dOptions.panDamping);

      dCamera.targetX += dPhysics.panVelocity.current.x;
      dCamera.targetY += dPhysics.panVelocity.current.y;

      if (Math.abs(dPhysics.panVelocity.current.x) < 0.01) dPhysics.panVelocity.current.x = 0;
      if (Math.abs(dPhysics.panVelocity.current.y) < 0.01) dPhysics.panVelocity.current.y = 0;

      // ===== Rotate Velocity 系统 =====
      if (!dInput.isRotating) {
        dPhysics.rotateVelocity.current.theta += (dPhysics.rotateVelocity.desired.theta - dPhysics.rotateVelocity.current.theta) * (1 - dOptions.rotateDamping);
        dPhysics.rotateVelocity.current.phi += (dPhysics.rotateVelocity.desired.phi - dPhysics.rotateVelocity.current.phi) * (1 - dOptions.rotateDamping);

        if (Math.abs(dPhysics.rotateVelocity.current.theta) < 0.001) dPhysics.rotateVelocity.current.theta = 0;
        if (Math.abs(dPhysics.rotateVelocity.current.phi) < 0.001) dPhysics.rotateVelocity.current.phi = 0;

        dCamera.theta += dPhysics.rotateVelocity.current.theta;
        dCamera.phi += dPhysics.rotateVelocity.current.phi;
        dCamera.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, dCamera.phi));
      }

      // ===== 缩放系统 =====
      const diff = dPhysics.targetRadius - dCamera.radius;
      if (Math.abs(diff) > 0.01) {
        dCamera.radius += diff * (1 - dOptions.zoomDamping);
      } else {
        dCamera.radius = dPhysics.targetRadius;
      }
      dCamera.radius = Math.max(dOptions.minRadius, Math.min(dOptions.maxRadius, dCamera.radius));
    });

    return true;
  }
})));
