/**
 * 坐标转换工具
 * 
 * 负责在屏幕坐标、世界坐标、ReactFlow 局部坐标之间转换
 */

import * as THREE from 'three';

// 平面 Z=0，用于射线相交
const XY_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * 屏幕坐标 → 世界坐标（与 Z=0 平面交点）
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
 * 相机状态
 */
export interface CameraState {
  targetX: number;
  targetY: number;
  radius: number;
  theta: number;  // 水平角度
  phi: number;    // 垂直角度
}

/**
 * 根据相机状态计算 Three.js Camera 位置
 */
export function updateCameraFromState(
  camera: THREE.PerspectiveCamera,
  state: CameraState
): void {
  const { targetX, targetY, radius, theta, phi } = state;

  // 球坐标转笛卡尔
  camera.position.x = targetX + radius * Math.sin(theta) * Math.cos(phi);
  camera.position.y = targetY + radius * Math.sin(phi);
  camera.position.z = radius * Math.cos(theta) * Math.cos(phi);

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
    // 逆旋转（注意符号）
    `rotateX(${-phi}rad)`,
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

  // 3. 逆旋转 X（-phi）
  const cosX = Math.cos(phi);
  const sinX = Math.sin(phi);
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

  // 1. 旋转 X（-phi）
  const cosX = Math.cos(-phi);
  const sinX = Math.sin(-phi);
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
