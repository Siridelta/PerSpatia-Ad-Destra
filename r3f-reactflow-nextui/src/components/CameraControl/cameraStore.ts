import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import * as THREE from 'three';

// 启用 Immer 对 Set 的支持
enableMapSet();

/**
 * 相机对外输出状态（下游 R3F 和 React Flow 看到的最终值）
 * 包含了：Base 用户值 + 物理 Offset 偏置
 */
export interface CameraState {
  targetX: number;
  targetY: number;
  radius: number;
  /** 最终方位角（Base Theta + Offset Theta） */
  theta: number;
  /** 最终极角（Base Phi + Offset Phi） */
  phi: number;
}

/** 物理内部计算状态 */
interface InnerPhysicsState {
  /** 用户控制的基础角度 */
  baseTheta: number;
  basePhi: number;
  /** 
   * 缩放的对数表示。
   * radius = exp(radiusLog)
   * 线性改变 radiusLog 对应于指数级改变 radius。
   */
  radiusLog: number;
  targetRadiusLog: number;

  /** 瞬时物理偏置（由平移速度产生） */
  offsetTheta: number;
  offsetPhi: number;
}

/** 正视 +Z（墙面在 z=0）时的默认极角：赤道 */
export const DEFAULT_SPHERICAL_PHI = Math.PI / 2;

/** 默认方位：+Z 方向 */
export const DEFAULT_SPHERICAL_THETA = 0;

/** 与 Spherical.makeSafe 同量级，避免 cos(phi)极点 */
export const SPHERICAL_PHI_MIN = 0.01;

export const SPHERICAL_PHI_MAX = Math.PI - 0.01;

export const FOV = 50;

/**
 * RF↔墙面换算里侧视锥体扩张用的半角 **α**（弧度）。
 */
export const alpha = (15 * Math.PI) / 180;

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
  /** 基础移速系数（会乘以 radius） */
  panKeyVelocity: number;
  /** 滚轮缩放速率（对数空间的线性步长） */
  wheelRate: number;
  /** 偏航偏置强度（显著加大以确保感知） */
  yawBiasStrength: number;
}

export const DEFAULT_CAMERA_OPTIONS: CameraOptions = {
  initialTargetX: 0,
  initialTargetY: 0,
  initialRadius: 30,
  initialTheta: DEFAULT_SPHERICAL_THETA,
  initialPhi: DEFAULT_SPHERICAL_PHI,
  minRadius: 5,
  maxRadius: 150,
  panDamping: 0.85,
  rotateDamping: 0.85,
  zoomDamping: 0.88,
  panKeyVelocity: 0.02, 
  wheelRate: 0.15,
  yawBiasStrength: 0.5, // 归一化后的新强度
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

  /** 核心物理状态 */
  inner: InnerPhysicsState;
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

/** 每个画布实例一份的 Zustand store（由 `CameraControl` 创建并放入 Context） */
export type CameraStoreApi = StoreApi<CameraStore>;

/**
 * 创建新的相机 store。勿在模块顶层单例化——由 `CameraControl` 在挂载时调用一次。
 */
export function createCameraStore(): CameraStoreApi {
  const initialRadiusLog = Math.log(DEFAULT_CAMERA_OPTIONS.initialRadius);

  return createStore(
    immer<CameraStore>((set, get) => ({
  // 初始状态 (对外输出)
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
    inner: {
      baseTheta: DEFAULT_CAMERA_OPTIONS.initialTheta,
      basePhi: DEFAULT_CAMERA_OPTIONS.initialPhi,
      radiusLog: initialRadiusLog,
      targetRadiusLog: initialRadiusLog,
      offsetTheta: 0,
      offsetPhi: 0,
    }
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
      // 同步更新物理内部状态
      if (newState.radius !== undefined) {
        const logV = Math.log(newState.radius);
        draft.physics.inner.radiusLog = logV;
        draft.physics.inner.targetRadiusLog = logV;
      }
      if (newState.theta !== undefined) 
        draft.physics.inner.baseTheta = newState.theta - draft.physics.inner.offsetTheta;
      if (newState.phi !== undefined) 
        draft.physics.inner.basePhi = newState.phi - draft.physics.inner.offsetPhi;
    });
  },

  // 辅助方法
  /**
   * 球坐标与 THREE.Spherical / Vector3.setFromSphericalCoords / OrbitControls 一致。
   * 默认 theta=0、phi=π/2 → 偏移 (0,0,+radius)，沿 +Z 正视 z=0 墙面。
   */
  updateSimulatedCamera: () => {
    const state = get();
    const { cameraState, simulatedCamera } = state;
    const { targetX, targetY, radius, theta, phi } = cameraState;

    simulatedCamera.position.setFromSphericalCoords(radius, phi, theta);
    simulatedCamera.position.x += targetX;
    simulatedCamera.position.y += targetY;
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

    set(draft => {
      const dx = clientX - input.lastPointerScreen!.x;
      const dy = clientY - input.lastPointerScreen!.y;
      draft.input.lastPointerScreen = { x: clientX, y: clientY };

      // 并行处理：旋转和平移可以同时进行
      if (input.isRotating) {
        // 与旧版左右手感一致：theta 增加方向与 Spherical 正向相反
        draft.physics.rotateOffset.desired.theta -= dx * 0.005;
        // 纵向：与 Spherical 默认 dy→phi 映射手感相反，故对 dy 取反（若仍反了再改符号）
        draft.physics.rotateOffset.desired.phi -= dy * 0.005;
      } 
      
      if (input.isPanning) {
        const lastPlane = state.screenToPlane(input.lastPointerScreen!.x, input.lastPointerScreen!.y);
        const currentPlane = state.screenToPlane(clientX, clientY);

        if (currentPlane && lastPlane) {
          const pdx = lastPlane.x - currentPlane.x;
          const pdy = lastPlane.y - currentPlane.y;
          draft.physics.panOffset.desired.x += pdx;
          draft.physics.panOffset.desired.y += pdy;
        }
      }
    });
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
    const { options, physics } = state;
    // 滚轮直接线性增减对数缩放值
    const logStep = deltaY > 0 ? options.wheelRate : -options.wheelRate;

    set(draft => {
      const minLog = Math.log(options.minRadius);
      const maxLog = Math.log(options.maxRadius);
      draft.physics.inner.targetRadiusLog = Math.max(
        minLog, 
        Math.min(maxLog, physics.inner.targetRadiusLog + logStep)
      );
    });
  },

  // Physics Loop
  tick: () => {
    const state = get();
    const { input, physics, cameraState } = state;
    const { inner } = physics;

    // 1. 快速检查是否需要继续动画
    const hasPanOffset = Math.abs(physics.panOffset.desired.x - physics.panOffset.current.x) > 0.01
      || Math.abs(physics.panOffset.desired.y - physics.panOffset.current.y) > 0.01;
    const hasRotateOffset = Math.abs(physics.rotateOffset.desired.theta - physics.rotateOffset.current.theta) > 0.001
      || Math.abs(physics.rotateOffset.desired.phi - physics.rotateOffset.current.phi) > 0.001;
    const hasPanVelocity = Math.abs(physics.panVelocity.current.x) > 0.01
      || Math.abs(physics.panVelocity.current.y) > 0.01;
    const hasRotateVelocity = Math.abs(physics.rotateVelocity.current.theta) > 0.001
      || Math.abs(physics.rotateVelocity.current.phi) > 0.001;
    const hasZoom = Math.abs(inner.targetRadiusLog - inner.radiusLog) > 0.001;
    // 检查偏置量回归
    const hasOffsetRegression = Math.abs(inner.offsetTheta) > 0.0001 || Math.abs(inner.offsetPhi) > 0.0001;

    const isMoving = hasPanOffset || hasRotateOffset || hasPanVelocity || hasRotateVelocity || hasZoom || hasOffsetRegression
      || input.isPanning || input.isRotating || input.keys.size > 0;

    if (!isMoving) return false;

    set((draft) => {
      const { input: dInput, physics: dPhysics, options: dOptions, cameraState: dCamera } = draft;
      const { inner: dInner } = dPhysics;

      // ===== Pan Offset 系统 (鼠标拖拽) =====
      let dragVelX = 0;
      let dragVelY = 0;
      if (dInput.isPanning) {
        dragVelX = (dPhysics.panOffset.desired.x - dPhysics.panOffset.current.x) * (1 - dOptions.panDamping);
        dragVelY = (dPhysics.panOffset.desired.y - dPhysics.panOffset.current.y) * (1 - dOptions.panDamping);

        dPhysics.panOffset.current.x += dragVelX;
        dPhysics.panOffset.current.y += dragVelY;
        dPhysics.panOffset.lastDelta = { x: dragVelX, y: dragVelY };

        dCamera.targetX += dragVelX;
        dCamera.targetY += dragVelY;
      }

      // ===== Rotate Offset 系统 (鼠标旋转) =====
      if (dInput.isRotating) {
        const dTheta = (dPhysics.rotateOffset.desired.theta - dPhysics.rotateOffset.current.theta) * (1 - dOptions.rotateDamping);
        const dPhi = (dPhysics.rotateOffset.desired.phi - dPhysics.rotateOffset.current.phi) * (1 - dOptions.rotateDamping);

        dPhysics.rotateOffset.current.theta += dTheta;
        dPhysics.rotateOffset.current.phi += dPhi;
        dPhysics.rotateOffset.lastDelta = { theta: dTheta, phi: dPhi };

        dInner.baseTheta += dTheta;
        dInner.basePhi += dPhi;
      }

      // ===== Pan Velocity 系统 (WASD) =====
      let targetVx = 0, targetVy = 0;
      // 移速正比于 radius
      const speedScale = dCamera.radius;
      if (dInput.keys.has('w')) targetVy += dOptions.panKeyVelocity * speedScale;
      if (dInput.keys.has('s')) targetVy -= dOptions.panKeyVelocity * speedScale;
      if (dInput.keys.has('a')) targetVx -= dOptions.panKeyVelocity * speedScale;
      if (dInput.keys.has('d')) targetVx += dOptions.panKeyVelocity * speedScale;

      dPhysics.panVelocity.desired.x = targetVx;
      dPhysics.panVelocity.desired.y = targetVy;

      dPhysics.panVelocity.current.x += (dPhysics.panVelocity.desired.x - dPhysics.panVelocity.current.x) * (1 - dOptions.panDamping);
      dPhysics.panVelocity.current.y += (dPhysics.panVelocity.desired.y - dPhysics.panVelocity.current.y) * (1 - dOptions.panDamping);

      dCamera.targetX += dPhysics.panVelocity.current.x;
      dCamera.targetY += dPhysics.panVelocity.current.y;

      // ===== Rotate Velocity 系统 (惯性旋转) =====
      if (!dInput.isRotating) {
        dPhysics.rotateVelocity.current.theta += (dPhysics.rotateVelocity.desired.theta - dPhysics.rotateVelocity.current.theta) * (1 - dOptions.rotateDamping);
        dPhysics.rotateVelocity.current.phi += (dPhysics.rotateVelocity.desired.phi - dPhysics.rotateVelocity.current.phi) * (1 - dOptions.rotateDamping);

        if (Math.abs(dPhysics.rotateVelocity.current.theta) < 0.001) dPhysics.rotateVelocity.current.theta = 0;
        if (Math.abs(dPhysics.rotateVelocity.current.phi) < 0.001) dPhysics.rotateVelocity.current.phi = 0;

        dInner.baseTheta += dPhysics.rotateVelocity.current.theta;
        dInner.basePhi += dPhysics.rotateVelocity.current.phi;
      }

      // ===== 动态偏航 (Dynamic Yaw Offset) 计算 =====
      const totalMovingX = dragVelX + dPhysics.panVelocity.current.x;
      const totalMovingY = dragVelY + dPhysics.panVelocity.current.y;
      
      const targetOffsetTheta = -totalMovingX * dOptions.yawBiasStrength;
      const targetOffsetPhi = totalMovingY * dOptions.yawBiasStrength;

      // 平滑逼近物理偏置
      dInner.offsetTheta += (targetOffsetTheta - dInner.offsetTheta) * 0.15;
      dInner.offsetPhi += (targetOffsetPhi - dInner.offsetPhi) * 0.15;

      
      // ===== 缩放系统 (对数空间) =====
      const logDiff = dInner.targetRadiusLog - dInner.radiusLog;
      if (Math.abs(logDiff) > 0.001) {
        dInner.radiusLog += logDiff * (1 - dOptions.zoomDamping);
      } else {
        dInner.radiusLog = dInner.targetRadiusLog;
      }

      // ===== 最终合成与导出 (Output) =====
      dCamera.radius = Math.exp(dInner.radiusLog);
      
      // 合成角度：基础值 + 物理偏置
      dCamera.theta = dInner.baseTheta + dInner.offsetTheta;
      dCamera.phi = Math.max(SPHERICAL_PHI_MIN, Math.min(SPHERICAL_PHI_MAX, dInner.basePhi + dInner.offsetPhi));
    });

    return true;
  },
    }))
  );
}
