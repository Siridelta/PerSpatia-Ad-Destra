/**
 * 2.5D React Flow 外壳用的纯 CSS 数学（与 Three 透视、球坐标 θ/φ 对齐）。
 *
 * 与 `cameraStore` 中的 `CameraState`、默认 φ 常量配套；不依赖 React，便于单测或文档对照。
 */

import { DEFAULT_SPHERICAL_PHI } from '../../store/cameraStore';

/**
 * 与 Three.js 透视相机 FOV 对齐的 CSS `perspective` 长度（像素）。
 */
export function calculateCSSPerspective(
  viewportHeight: number,
  fovDegrees: number
): number {
  return (viewportHeight / 2) / Math.tan((fovDegrees * Math.PI / 180) / 2);
}

/**
 * 外壳 `transform`，使 DOM 层与球坐标相机在屏幕上的左右、俯仰一致。
 * 约定见 `docs/camera-architecture.md`（rotateX / rotateY 符号以 `ReactFlow3D` 为准）。
 */
export function buildShellTransform(phi: number, theta: number): string {
  return `rotateX(${phi - DEFAULT_SPHERICAL_PHI}rad) rotateY(${-theta}rad)`;
}
