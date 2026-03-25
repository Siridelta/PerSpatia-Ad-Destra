/**
 * 调试用相机 HUD：依赖 CameraControl Context，不依赖 Canvas。
 * 缩放任显示与 RF 同步公式一致：zoom = 30 / radius（与 ReactFlowViewportSync 相同）。
 */

import React from 'react';

import { useCameraControl } from './CameraControl';

export function CameraDebugHud() {
  const cameraState = useCameraControl((s) => s.cameraState);
  const zoom = 30 / cameraState.radius;

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
        Target: ({cameraState.targetX.toFixed(0)}, {cameraState.targetY.toFixed(0)})
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
