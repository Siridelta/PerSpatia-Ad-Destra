/**
 * 调试用相机 HUD：依赖 CameraControl Context，不依赖 Canvas。
 * Zoom 与 `ReactFlowViewportSync` 同一套就地公式（含 `expans`）。
 */

import React from 'react';

import { alpha, FOV } from './cameraStore';
import { useCameraControl } from '.';
import { SCREEN_METRIC_TO_THREE } from '../ReactFlow3D/ReactFlowViewportSync';

export function CameraDebugHud() {
  const cameraState = useCameraControl().useCameraState();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fovRad = (FOV * Math.PI) / 180;
  const standardZ = vh / 2 / SCREEN_METRIC_TO_THREE / Math.tan(fovRad / 2);
  const zoom = standardZ / cameraState.radius;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 20,
        color: 'rgba(125, 225, 234, 0.6)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        pointerEvents: 'none',
        zIndex: 1000,
        textAlign: 'right',
        lineHeight: 1.5,
      }}
    >
      <div>
        Orbit Center: ({cameraState.orbitCenterX.toFixed(0)}, {cameraState.orbitCenterY.toFixed(0)})
      </div>
      <div>
        Radius: {cameraState.radius.toFixed(1)} | θ:{' '}
        {((cameraState.theta * 180) / Math.PI).toFixed(0)}° φ:{' '}
        {((cameraState.phi * 180) / Math.PI).toFixed(0)}°
      </div>
      <div>Zoom: {zoom.toFixed(2)}x</div>
    </div>
  );
}
