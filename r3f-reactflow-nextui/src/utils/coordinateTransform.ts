/**
 * 坐标转换工具
 *
 * 负责在屏幕坐标、世界坐标、ReactFlow 局部坐标之间转换
 *
 * 相机球坐标与 THREE.Spherical / OrbitControls 一致：
 * - phi：从 +Y 轴向下的极角（0 = +Y 顶端，π/2 = XZ 赤道，π = -Y）
 * - theta：在 XZ 平面内从 +Z 轴起算的方位角（Math.atan2(x, z) 与 Three 源码一致）
 * - 位置：Vector3.setFromSphericalCoords(radius, phi, theta)，再平移到注视点 (targetX, targetY, 0)
 */

import * as THREE from 'three';

/** 正视 +Z（墙面在 z=0）时的默认极角：赤道 */
export const DEFAULT_SPHERICAL_PHI = Math.PI / 2;

/** 默认方位：+Z 方向 */
export const DEFAULT_SPHERICAL_THETA = 0;

/** 与 Spherical.makeSafe 同量级，避免 cos(phi) 极点 */
export const SPHERICAL_PHI_MIN = 0.01;

export const SPHERICAL_PHI_MAX = Math.PI - 0.01;

/** 由球坐标得到相对注视点 (0,0,0) 的相机位置偏移（与 Three 一致） */
export function offsetFromSpherical(
  radius: number,
  phi: number,
  theta: number,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
  return out.setFromSphericalCoords(radius, phi, theta);
}

// 平面 Z=0，用于射线相交
const XY_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * 屏幕坐标 → 世界坐标（与 Z=0 平面交点）- 使用 Three.js Camera
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
): THREE.Vector3 | null {
  const mouse = new THREE.Vector2(
    (screenX / viewportWidth) * 2 - 1,
    -(screenY / viewportHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const target = new THREE.Vector3();
  const intersected = raycaster.ray.intersectPlane(XY_PLANE, target);

  return intersected ? target : null;
}

/**
 * 屏幕坐标 → 世界坐标（纯数学计算，不依赖 Three.js 运行时）
 * 
 * 基于相机状态直接计算射线与 Z=0 平面的交点
 */
export function screenToWorldFromState(
  screenX: number,
  screenY: number,
  state: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  fovDegrees: number = 50
): { x: number; y: number; z: number } | null {
  const { targetX, targetY, radius, theta, phi } = state;

  // 1. 相机位置（THREE.Spherical / setFromSphericalCoords）
  const off = offsetFromSpherical(radius, phi, theta);
  const camX = targetX + off.x;
  const camY = targetY + off.y;
  const camZ = off.z;
  
  // 2. 计算屏幕坐标对应的 NDC (-1 到 1)
  const ndcX = (screenX / viewportWidth) * 2 - 1;
  const ndcY = -(screenY / viewportHeight) * 2 + 1;
  
  // 3. 计算射线方向（透视投影）
  const tanFov = Math.tan((fovDegrees * Math.PI / 180) / 2);
  const aspect = viewportWidth / viewportHeight;
  
  // 相机朝向（lookAt 方向）
  const forwardX = targetX - camX;
  const forwardY = targetY - camY;
  const forwardZ = -camZ; // 看向原点方向
  const forwardLen = Math.sqrt(forwardX * forwardX + forwardY * forwardY + forwardZ * forwardZ);
  const fx = forwardX / forwardLen;
  const fy = forwardY / forwardLen;
  const fz = forwardZ / forwardLen;
  
  // 相机右方向（与 forward 和 world up (0,1,0) 垂直）
  const rightX = fz; // cross(forward, up).x = forward.z * up.y - forward.y * up.z
  const rightY = 0;
  const rightZ = -fx; // cross(forward, up).z = forward.x * up.y - forward.y * up.x = -forward.x
  const rightLen = Math.sqrt(rightX * rightX + rightZ * rightZ);
  const rx = rightX / rightLen;
  const rz = rightZ / rightLen;
  
  // 相机上方向（cross(right, forward)）
  const upX = -fy * rz;
  const upY = rx * fz - rz * fx;
  const upZ = fy * rx;
  
  // 射线方向 = forward + ndcX * right * tanFov * aspect + ndcY * up * tanFov
  const rayDirX = fx + ndcX * rx * tanFov * aspect + ndcY * upX * tanFov;
  const rayDirY = fy + ndcY * upY * tanFov; // right 的 y 分量为 0
  const rayDirZ = fz + ndcX * rz * tanFov * aspect + ndcY * upZ * tanFov;
  
  // 4. 求与 Z=0 平面的交点
  // ray = cameraPos + t * rayDir, 求 z=0 时的 t
  // camZ + t * rayDirZ = 0 => t = -camZ / rayDirZ
  if (Math.abs(rayDirZ) < 0.0001) return null; // 射线平行于平面
  
  const t = -camZ / rayDirZ;
  if (t < 0) return null; // 交点在相机后方
  
  return {
    x: camX + t * rayDirX,
    y: camY + t * rayDirY,
    z: 0
  };
}

/**
 * 世界坐标 → 屏幕坐标
 */
export function worldToScreen(
  worldPos: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } | null {
  const projected = worldPos.clone().project(camera);
  
  // 检查是否在视锥体内
  if (projected.z < -1 || projected.z > 1) {
    return null;
  }

  return {
    x: (projected.x + 1) / 2 * viewportWidth,
    y: -(projected.y - 1) / 2 * viewportHeight
  };
}

/**
 * 相机状态（球坐标与 THREE.Spherical / OrbitControls 一致）
 */
export interface CameraState {
  targetX: number;
  targetY: number;
  radius: number;
  /** XZ 平面内方位角（弧度），从 +Z 起算，同 THREE.Spherical.theta */
  theta: number;
  /** 从 +Y 向下的极角（弧度），同 THREE.Spherical.phi；π/2 为赤道 = 正视 +Z */
  phi: number;
}

/**
 * 根据相机状态计算 Three.js Camera 位置
 */
export function updateCameraFromState(
  camera: THREE.PerspectiveCamera,
  state: CameraState
): void {
  const { targetX, targetY, radius, theta, phi } = state;

  offsetFromSpherical(radius, phi, theta, camera.position);
  camera.position.x += targetX;
  camera.position.y += targetY;

  camera.lookAt(targetX, targetY, 0);
}

/**
 * 计算 CSS transform 以匹配相机视角
 * 
 * ReactFlow 容器需要应用相反的变换来"抵消"相机视角
 */
export function calculateCSSTransform(
  state: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  fov: number
): string {
  const { targetX, targetY, radius, theta, phi } = state;

  // 透视值匹配 Three.js FOV
  const perspective = (viewportHeight / 2) / Math.tan((fov * Math.PI / 180) / 2);

  // 构建 transform
  // 顺序很重要：从内到外应用变换
  const transforms = [
    // 1. 移动到视口中心
    `translate(-50%, -50%)`,
    `translate3d(${viewportWidth / 2}px, ${viewportHeight / 2}px, 0)`,
    
    // 2. 应用相机的逆变换
    // 先移动半径距离（相机到原点的距离）
    `translateZ(${-radius}px)`,
    // 与 ReactFlow3D 一致：相对赤道 π/2 的倾角
    `rotateX(${DEFAULT_SPHERICAL_PHI - phi}rad)`,
    `rotateY(${theta}rad)`,
    
    // 3. 平移补偿 target
    `translate3d(${-targetX}px, ${targetY}px, 0)`
  ];

  return `perspective(${perspective}px) ${transforms.join(' ')}`;
}

/**
 * 世界坐标 → ReactFlow 局部坐标
 * 
 * 应用 CSS transform 的逆变换
 */
export function worldToLocal(
  worldX: number,
  worldY: number,
  state: CameraState
): { x: number; y: number } {
  const { targetX, targetY, theta, phi } = state;

  // 1. 减去 target 平移
  let x = worldX - targetX;
  let y = worldY - targetY;
  let z = 0;

  // 2. 逆旋转 Y（theta）
  const cosY = Math.cos(-theta);
  const sinY = Math.sin(-theta);
  const x2 = x * cosY - z * sinY;
  const z2 = x * sinY + z * cosY;
  x = x2;
  z = z2;

  // 3. 逆旋转 X（赤道基准：-(π/2 - phi) = phi - π/2）
  const ax = phi - DEFAULT_SPHERICAL_PHI;
  const cosX = Math.cos(-ax);
  const sinX = Math.sin(-ax);
  const y3 = y * cosX - z * sinX;
  z = y * sinX + z * cosX;
  y = y3;

  // 4. 现在应该位于相机空间，不需要再处理 radius

  return { x, y };
}

/**
 * ReactFlow 局部坐标 → 世界坐标
 */
export function localToWorld(
  localX: number,
  localY: number,
  state: CameraState
): { x: number; y: number; z: number } {
  const { targetX, targetY, theta, phi } = state;

  let x = localX;
  let y = localY;
  let z = 0;

  // 1. 旋转 X（π/2 - phi），与 CSS rotateX 顺序一致
  const ax = DEFAULT_SPHERICAL_PHI - phi;
  const cosX = Math.cos(ax);
  const sinX = Math.sin(ax);
  const y2 = y * cosX - z * sinX;
  const z2 = y * sinX + z * cosX;
  y = y2;
  z = z2;

  // 2. 旋转 Y（theta）
  const cosY = Math.cos(theta);
  const sinY = Math.sin(theta);
  const x3 = x * cosY - z * sinY;
  const z3 = x * sinY + z * cosY;
  x = x3;
  z = z3;

  // 3. 加上 target
  x += targetX;
  y += targetY;

  return { x, y, z };
}

/**
 * 计算匹配相机状态的 CSS perspective 值
 */
export function calculateCSSPerspective(
  viewportHeight: number,
  fovDegrees: number
): number {
  return (viewportHeight / 2) / Math.tan((fovDegrees * Math.PI / 180) / 2);
}
