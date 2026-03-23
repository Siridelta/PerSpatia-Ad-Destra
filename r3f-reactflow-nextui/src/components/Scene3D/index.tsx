/**
 * Scene3D 组件 - 纯 3D 背景场景
 * 
 * 职责：
 * 1. 渲染 3D 背景（星星、菱形、渐变平面）
 * 2. 接收相机状态并同步 Three.js Camera
 * 3. 支持缩放（兼容旧版 sceneScale）
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { CameraState } from '../../utils/coordinateTransform';

export interface Scene3DRef {
  setScale: (scale: number) => void;
}

interface Scene3DProps {
  cameraState?: CameraState;
  sceneScale?: number;  // 兼容旧版
}

// 3D 背景效果组件
function BackgroundEffects({ scale = 1 }: { scale?: number }) {
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
        rotation={[0, 0, 0]}
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
      
      {/* 可缩放的菱形组 */}
      <group ref={groupRef} scale={scale}>
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

// 相机同步组件
interface CameraSyncProps {
  cameraState: CameraState;
}

function CameraSync({ cameraState }: CameraSyncProps) {
  const { camera } = useThree();
  
  // 每帧同步相机位置
  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    
    const { targetX, targetY, radius, theta, phi } = cameraState;
    
    // 球坐标转笛卡尔（theta 取反让水平方向正确，phi 不取反让竖直方向正确）
    camera.position.x = targetX + radius * Math.sin(-theta) * Math.cos(phi);
    camera.position.y = targetY + radius * Math.sin(phi);
    camera.position.z = radius * Math.cos(-theta) * Math.cos(phi);
    
    camera.lookAt(targetX, targetY, 0);
  });
  
  return null;
}

// 主场景组件
export const Scene3D = forwardRef<Scene3DRef, Scene3DProps>(
  function Scene3D({ cameraState, sceneScale = 1 }, ref) {
    const scaleRef = useRef(sceneScale);
    
    // 默认相机状态
    const defaultState: CameraState = {
      targetX: 0,
      targetY: 0,
      radius: 30,
      theta: 0,
      phi: 0,
    };
    
    const state = cameraState || defaultState;
    
    useImperativeHandle(ref, () => ({
      setScale: (scale: number) => {
        scaleRef.current = scale;
      },
    }));
    
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 0,
        overflow: 'hidden'
      }}>
        <Canvas
          camera={{ position: [0, 0, 30], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <CameraSync cameraState={state} />
          
          {/* 3D 背景效果（带缩放） */}
          <BackgroundEffects scale={scaleRef.current} />
        </Canvas>
      </div>
    );
  }
);

export default Scene3D;
