import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import * as THREE from 'three';
import { rotate } from 'three/tsl';

// 启用 Immer 对 Set 的支持
enableMapSet();

/**
 * 相机对外输出状态（下游 R3F 和 React Flow 看到的最终值）
 * 包含了：Base 用户值 + 物理 Drift 漂移
 */
export interface CameraState {
  orbitCenterX: number;
  orbitCenterY: number;
  radius: number;
  /** 最终方位角（Base Theta + Drift Theta） */
  theta: number;
  /** 最终极角（Base Phi + Drift Phi） */
  phi: number;
}

/** 物理内部计算状态 */
interface InnerPhysicsState {
  /** 用户控制的基础旋转角度（持久态） */
  baseRotation: {
    theta: number;
    phi: number;
  };
  
  /** 
   * 缩放系统。
   * radius = exp(log)
   * 线性改变 log 对应于指数级改变 radius。
   */
  zoom: {
    log: number;
    targetLog: number;
  };

  /** 瞬时物理漂移（暂态，由平移速度产生） */
  drift: {
    theta: number;
    phi: number;
  };
}

/** 正视 +Z（墙面在 z=0）时的默认极角：赤道 */
export const DEFAULT_SPHERICAL_PHI = Math.PI / 2;

/** 默认方位：+Z 方向 */
export const DEFAULT_SPHERICAL_THETA = 0;

/** 与 Spherical.makeSafe 同量级，避免 cos(phi)极点 */
export const SPHERICAL_PHI_MIN = 0.01;

export const SPHERICAL_PHI_MAX = Math.PI - 0.01;

/** 锥体限制范围：20 度 (弧度制) */
export const MAX_CONE_ANGLE = (20 * Math.PI) / 180;

export const FOV = 50;

/**
 * RF↔墙面换算里侧视锥体扩张用的半角 **α**（弧度）。
 */
export const alpha = (20 * Math.PI) / 180;

// 配置选项
export interface CameraOptions {
  initialOrbitCenterX: number;
  initialOrbitCenterY: number;
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
  initialOrbitCenterX: 0,
  initialOrbitCenterY: 0,
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
  yawBiasStrength: 5, // 归一化后的新强度
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
    target: { x: number; y: number };
    current: { x: number; y: number };
    lastDelta: { x: number; y: number };
  };
  rotateOffset: {
    target: { theta: number; phi: number };
    current: { theta: number; phi: number };
    lastDelta: { theta: number; phi: number };
  };
  panVelocity: {
    target: { x: number; y: number };
    current: { x: number; y: number };
  };
  rotateVelocity: {
    target: { theta: number; phi: number };
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
        orbitCenterX: DEFAULT_CAMERA_OPTIONS.initialOrbitCenterX,
        orbitCenterY: DEFAULT_CAMERA_OPTIONS.initialOrbitCenterY,
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
        rotateAnchor: null,
      },

      physics: {
        panOffset: {
          target: { x: 0, y: 0 },
          current: { x: 0, y: 0 },
          lastDelta: { x: 0, y: 0 },
        },
        rotateOffset: {
          target: { theta: 0, phi: 0 },
          current: { theta: 0, phi: 0 },
          lastDelta: { theta: 0, phi: 0 },
        },
        panVelocity: {
          target: { x: 0, y: 0 },
          current: { x: 0, y: 0 },
        },
        rotateVelocity: {
          target: { theta: 0, phi: 0 },
          current: { theta: 0, phi: 0 },
        },
        inner: {
          baseRotation: {
            theta: DEFAULT_CAMERA_OPTIONS.initialTheta,
            phi: DEFAULT_CAMERA_OPTIONS.initialPhi,
          },
          zoom: {
            log: initialRadiusLog,
            targetLog: initialRadiusLog,
          },
          drift: {
            theta: 0,
            phi: 0,
          },
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
            draft.physics.inner.zoom.log = logV;
            draft.physics.inner.zoom.targetLog = logV;
          }
          if (newState.theta !== undefined)
            draft.physics.inner.baseRotation.theta = newState.theta - draft.physics.inner.drift.theta;
          if (newState.phi !== undefined)
            draft.physics.inner.baseRotation.phi = newState.phi - draft.physics.inner.drift.phi;
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
        const { orbitCenterX, orbitCenterY, radius, theta, phi } = cameraState;

        simulatedCamera.position.setFromSphericalCoords(radius, phi, theta);
        simulatedCamera.position.x += orbitCenterX;
        simulatedCamera.position.y += orbitCenterY;
        simulatedCamera.lookAt(orbitCenterX, orbitCenterY, 0);
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
            target: { x: 0, y: 0 },
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
            target: { theta: 0, phi: 0 },
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
            // 恢复增量模式：直接在当前基础上累加
            // 注意：这里我们累加到 target 上，物理系统会追随它
            draft.physics.rotateOffset.target.theta -= dx * 0.005;
            draft.physics.rotateOffset.target.phi -= dy * 0.005;
          }

          if (input.isPanning) {
            const lastPlane = state.screenToPlane(input.lastPointerScreen!.x, input.lastPointerScreen!.y);
            const currentPlane = state.screenToPlane(clientX, clientY);

            if (currentPlane && lastPlane) {
              const pdx = lastPlane.x - currentPlane.x;
              const pdy = lastPlane.y - currentPlane.y;
              draft.physics.panOffset.target.x += pdx;
              draft.physics.panOffset.target.y += pdy;
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
              target: { x: 0, y: 0 },
              current: { x: 0, y: 0 },
              lastDelta: { x: 0, y: 0 },
            };

            draft.input.isPanning = false;
          }

          if (input.isRotating) {
            draft.physics.rotateVelocity.current.theta += physics.rotateOffset.lastDelta.theta;
            draft.physics.rotateVelocity.current.phi += physics.rotateOffset.lastDelta.phi;

            draft.physics.rotateOffset = {
              target: { theta: 0, phi: 0 },
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
          draft.physics.inner.zoom.targetLog = Math.max(
            minLog,
            Math.min(maxLog, physics.inner.zoom.targetLog + logStep)
          );
        });
      },

      // Physics Loop
      tick: () => {
        const state = get();
        const { input, physics, cameraState } = state;
        const { inner } = physics;

        // 1. 快速检查是否需要继续动画
        const hasPanOffset = Math.abs(physics.panOffset.target.x - physics.panOffset.current.x) > 0.01
          || Math.abs(physics.panOffset.target.y - physics.panOffset.current.y) > 0.01;
        const hasRotateOffset = Math.abs(physics.rotateOffset.target.theta - physics.rotateOffset.current.theta) > 0.001
          || Math.abs(physics.rotateOffset.target.phi - physics.rotateOffset.current.phi) > 0.001;
        const hasPanVelocity = Math.abs(physics.panVelocity.current.x) > 0.01
          || Math.abs(physics.panVelocity.current.y) > 0.01;
        const hasRotateVelocity = Math.abs(physics.rotateVelocity.current.theta) > 0.001
          || Math.abs(physics.rotateVelocity.current.phi) > 0.001;
        const hasZoom = Math.abs(inner.zoom.targetLog - inner.zoom.log) > 0.001;
        // 检查偏置量回归
        const hasDriftRegression = Math.abs(inner.drift.theta) > 0.0001 || Math.abs(inner.drift.phi) > 0.0001;

        const isMoving = hasPanOffset || hasRotateOffset || hasPanVelocity || hasRotateVelocity || hasZoom || hasDriftRegression
          || input.isPanning || input.isRotating || input.keys.size > 0;
        if (!isMoving) return false;

        set((draft) => {
          const { input: dInput, physics: dPhysics, options: dOptions, cameraState: dCamera } = draft;
          const { inner: dInner } = dPhysics;

          // ===== Pan Offset 系统 (鼠标拖拽) =====
          let dragVelX = 0;
          let dragVelY = 0;
          if (dInput.isPanning) {
            dragVelX = (dPhysics.panOffset.target.x - dPhysics.panOffset.current.x) * (1 - dOptions.panDamping);
            dragVelY = (dPhysics.panOffset.target.y - dPhysics.panOffset.current.y) * (1 - dOptions.panDamping);

            dPhysics.panOffset.current.x += dragVelX;
            dPhysics.panOffset.current.y += dragVelY;
            dPhysics.panOffset.lastDelta = { x: dragVelX, y: dragVelY };

            dCamera.orbitCenterX += dragVelX;
            dCamera.orbitCenterY += dragVelY;
          }

          // ===== Pan Velocity 系统 (WASD) =====
          let targetVx = 0, targetVy = 0;
          // 移速正比于 radius
          const speedScale = dCamera.radius;
          if (dInput.keys.has('w')) targetVy += dOptions.panKeyVelocity * speedScale;
          if (dInput.keys.has('s')) targetVy -= dOptions.panKeyVelocity * speedScale;
          if (dInput.keys.has('a')) targetVx -= dOptions.panKeyVelocity * speedScale;
          if (dInput.keys.has('d')) targetVx += dOptions.panKeyVelocity * speedScale;

          dPhysics.panVelocity.target.x = targetVx;
          dPhysics.panVelocity.target.y = targetVy;

          dPhysics.panVelocity.current.x += (dPhysics.panVelocity.target.x - dPhysics.panVelocity.current.x) * (1 - dOptions.panDamping);
          dPhysics.panVelocity.current.y += (dPhysics.panVelocity.target.y - dPhysics.panVelocity.current.y) * (1 - dOptions.panDamping);

          dCamera.orbitCenterX += dPhysics.panVelocity.current.x;
          dCamera.orbitCenterY += dPhysics.panVelocity.current.y;

          // ===== Rotate Offset 系统 (追踪器增量模型) =====
          // Offset (current) 自由追随 Target，不受物理限制
          const dOffsetTheta = (dPhysics.rotateOffset.target.theta - dPhysics.rotateOffset.current.theta) * (1 - dOptions.rotateDamping);
          const dOffsetPhi = (dPhysics.rotateOffset.target.phi - dPhysics.rotateOffset.current.phi) * (1 - dOptions.rotateDamping);

          dPhysics.rotateOffset.current.theta += dOffsetTheta;
          dPhysics.rotateOffset.current.phi += dOffsetPhi;
          // 记录增量供松手后的惯性使用
          dPhysics.rotateOffset.lastDelta = { theta: dOffsetTheta, phi: dOffsetPhi };

          // 1. 先根据输入状态确定这一帧的总旋转增量 (Delta)
          let dRotationTheta = 0;
          let dRotationPhi = 0;

          if (dInput.isRotating) {
            // 旋转时：增量来自偏移追踪器
            dRotationTheta = dOffsetTheta;
            dRotationPhi = dOffsetPhi;
          } else {
            // 松手后：增量来自惯性速度 (Rotate Velocity 系统)
            dPhysics.rotateVelocity.current.theta += (dPhysics.rotateVelocity.target.theta - dPhysics.rotateVelocity.current.theta) * (1 - dOptions.rotateDamping);
            dPhysics.rotateVelocity.current.phi += (dPhysics.rotateVelocity.target.phi - dPhysics.rotateVelocity.current.phi) * (1 - dOptions.rotateDamping);

            if (Math.abs(dPhysics.rotateVelocity.current.theta) < 0.001) dPhysics.rotateVelocity.current.theta = 0;
            if (Math.abs(dPhysics.rotateVelocity.current.phi) < 0.001) dPhysics.rotateVelocity.current.phi = 0;

            dRotationTheta = dPhysics.rotateVelocity.current.theta;
            dRotationPhi = dPhysics.rotateVelocity.current.phi;
          }

          // 2. 将增量应用到 baseAngles
          dInner.baseRotation.theta += dRotationTheta;
          dInner.baseRotation.phi += dRotationPhi;

          // 3. Clamp 到锥体范围（近似实现，Clamp 到 (theta, phi) 分量空间的圆范围内）
          // 仅针对手动旋转产生的 base 角度进行圆限制，与平移产生的偏航（drift）无关
          const baseDevTheta = dInner.baseRotation.theta - DEFAULT_SPHERICAL_THETA;
          const baseDevPhi = dInner.baseRotation.phi - DEFAULT_SPHERICAL_PHI;
          const baseDevLen = Math.sqrt(baseDevTheta * baseDevTheta + baseDevPhi * baseDevPhi);

          if (baseDevLen > MAX_CONE_ANGLE) {
            const scale = MAX_CONE_ANGLE / baseDevLen;
            // 将 base 强制投影回圆周
            dInner.baseRotation.theta = baseDevTheta * scale + DEFAULT_SPHERICAL_THETA;
            dInner.baseRotation.phi = baseDevPhi * scale + DEFAULT_SPHERICAL_PHI;

            // 撞墙处理：速度投影（沿圆周滑动）
            if (!dInput.isRotating) {
              const v = dPhysics.rotateVelocity.current;
              // 法向量 (从圆心指向当前 base)
              const nx = baseDevTheta / baseDevLen;
              const ny = baseDevPhi / baseDevLen;
              // 速度在法线方向的分量 (dot product)
              const vNormal = v.theta * nx + v.phi * ny;
              // 如果速度向外，则从总速度中减去法向分量，实现沿切线滑动
              if (vNormal > 0) {
                v.theta -= vNormal * nx;
                v.phi -= vNormal * ny;
              }
            }

            // 同步 rotateOffset 以消除死区
            if (dInput.isRotating) {
              dPhysics.rotateOffset.target.theta = dInner.baseRotation.theta;
              dPhysics.rotateOffset.target.phi = dInner.baseRotation.phi;
              dPhysics.rotateOffset.current.theta = dInner.baseRotation.theta;
              dPhysics.rotateOffset.current.phi = dInner.baseRotation.phi;
            }
          }
          // ===== 动态偏航 (Dynamic Yaw Drift) 计算 =====
          const totalMovingX = dragVelX + dPhysics.panVelocity.current.x;
          const totalMovingY = dragVelY + dPhysics.panVelocity.current.y;

          // 除以半径使不同缩放层级下的偏航感一致
          let targetDriftTheta = (-totalMovingX * dOptions.yawBiasStrength) / dCamera.radius;
          let targetDriftPhi = (totalMovingY * dOptions.yawBiasStrength) / dCamera.radius;

          // 限制在一个圆/锥形范围内 (clamp 向量长度)，仅针对偏置
          // 自适应计算：键盘平移导致的稳态速度为 dOptions.panKeyVelocity * radius
          // 对应产生的理论最大偏置基准为 panKeyVelocity * yawBiasStrength
          const MAX_DRIFT = dOptions.panKeyVelocity * dOptions.yawBiasStrength;
          const driftLength = Math.sqrt(targetDriftTheta * targetDriftTheta + targetDriftPhi * targetDriftPhi);
          if (driftLength > MAX_DRIFT) {
            const scale = MAX_DRIFT / driftLength;
            targetDriftTheta *= scale;
            targetDriftPhi *= scale;
          }

          // 平滑逼近物理漂移
          dInner.drift.theta += (targetDriftTheta - dInner.drift.theta) * 0.15;
          dInner.drift.phi += (targetDriftPhi - dInner.drift.phi) * 0.15;

          // ===== 缩放系统 (对数空间) =====
          const logDiff = dInner.zoom.targetLog - dInner.zoom.log;
          if (Math.abs(logDiff) > 0.001) {
            dInner.zoom.log += logDiff * (1 - dOptions.zoomDamping);
          } else {
            dInner.zoom.log = dInner.zoom.targetLog;
          }

          // ===== 最终合成与导出 (Output) =====
          dCamera.radius = Math.exp(dInner.zoom.log);

          // 合成角度：基础值 + 物理漂移
          dCamera.theta = dInner.baseRotation.theta + dInner.drift.theta;
          dCamera.phi = Math.max(SPHERICAL_PHI_MIN, Math.min(SPHERICAL_PHI_MAX, dInner.baseRotation.phi + dInner.drift.phi));
        });

        return true;
      },
    }))
  );
}
