/**
 * Scene3D 组件 - 纯 3D 背景场景
 *
 * 职责：
 * 1. 渲染 3D 背景（星星、菱形、渐变平面）
 * 2. 在 R3F 内同步 Three.js 相机（store 由外层注入：R3F Canvas 子树不继承外层 React Context）
 * 3. 背景装饰组缩放与 RF 视口一致：每帧按 `30 / radius` 更新
 */

import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { FOV, useCameraExternalClock, useCameraSubscribe, useCameraControl } from '../CameraControl';
import type { CameraState, CameraControlApi } from '../CameraControl';

// 3D 背景效果组件
function BackgroundEffects({ cameraControlApi }: { cameraControlApi: CameraControlApi }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {

    if (meshRef.current) {
      meshRef.current.rotation.z += 0.0005;
      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = state.clock.elapsedTime;
      }
    }
  });

  // 可缩放的菱形
  const diamonds = React.useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 120,
        (Math.random() - 0.5) * 80,
        -10 - Math.random() * 60
      ] as [number, number, number],
      scale: 0.5 + Math.random() * 2,
      speed: 0.2 + Math.random() * 0.5,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    }));
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        child.position.y += Math.sin(state.clock.elapsedTime * diamonds[i].speed) * 0.02;
        child.rotation.z += diamonds[i].rotationSpeed;
      });
    }
  });

  return (
    <>
      {/* Debug: XY 平面网格 (Z=0，与 ReactFlow 画布对齐) */}
      <gridHelper 
        args={[200, 40, '#e94560', '#444444']} 
        position={[0, 0, 0]} 
        rotation={[Math.PI / 2, 0, 0]}
      />
      
      {/* 渐变背景平面 */}
      <mesh ref={meshRef} position={[0, 0, -80]} scale={[200, 200, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          uniforms={{
            uTime: { value: 0 },
            uColor1: { value: new THREE.Color('#1a0a2e') },
            uColor2: { value: new THREE.Color('#16213e') },
            uColor3: { value: new THREE.Color('#0f3460') },
          }}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform vec3 uColor3;
            varying vec2 vUv;
            
            void main() {
              float mixFactor = vUv.x * 0.7 + vUv.y * 0.3;
              vec3 color = mix(uColor1, uColor2, mixFactor);
              color = mix(color, uColor3, sin(uTime * 0.2) * 0.1 + 0.1);
              
              float gridX = step(0.98, fract(vUv.x * 20.0));
              float gridY = step(0.98, fract(vUv.y * 20.0));
              float grid = max(gridX, gridY) * 0.05;
              
              gl_FragColor = vec4(color + grid, 1.0);
            }
          `}
        />
      </mesh>
      
      {/* 可缩放的菱形组（scale 在 useFrame 中按相机 radius 写入） */}
      <group ref={groupRef}>
        {diamonds.map((d, i) => (
          <mesh key={i} position={d.position} scale={d.scale}>
            <planeGeometry args={[2, 2]} />
            <meshBasicMaterial 
              color="#e94560" 
              transparent 
              opacity={0.15}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
      
      {/* 星星粒子 */}
      <Stars 
        radius={150} 
        depth={80}
        count={2000} 
        factor={6} 
        saturation={0.5} 
        fade 
      />
    </>
  );
}

// 相机同步组件（在 R3F Canvas 内；store 由外层 Scene3D 注入）
function CameraSync({ cameraControlApi }: { cameraControlApi: CameraControlApi }) {
  const { camera } = useThree();

  const cameraControlTick = cameraControlApi.useCameraExternalClock();
  
  // 每帧同步相机位置和运行物理循环
  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    
    // 运行物理循环
    cameraControlTick();
    
    // 读取最新状态
    const { orbitCenterX, orbitCenterY, radius, theta, phi } = cameraControlApi.getCameraSnapshot();
    
    // THREE.Spherical / setFromSphericalCoords，与 OrbitControls 约定一致
    camera.position.setFromSphericalCoords(radius, phi, theta);
    camera.position.x += orbitCenterX;
    camera.position.y += orbitCenterY;
    
    camera.lookAt(orbitCenterX, orbitCenterY, 0);
  });
  
  return null;
}

// 主场景组件（无 props；缩放完全由相机 store 推导）
export function Scene3D() {
  // 必须在 `<Canvas>` 外读取，再注入 R3F 子树（见文件头注释）
  const cameraControlApi = useCameraControl();

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 30], fov: FOV }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <CameraSync cameraControlApi={cameraControlApi} />

        <BackgroundEffects cameraControlApi={cameraControlApi} />
      </Canvas>
    </div>
  );
}

export default Scene3D;
