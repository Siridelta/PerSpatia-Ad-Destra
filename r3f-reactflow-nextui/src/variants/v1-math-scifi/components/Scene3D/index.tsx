/**
 * Scene3D 组件 - 纯 3D 背景场景
 *
 * 职责：
 * 1. 渲染无限远渐变背景（跟随相机移动，永远填满视口）
 * 2. 渲染无限延伸的三角网格（基于世界坐标，相机移动时不位移）
 * 3. 渲染 3D 装饰物件（星星、菱形）
 */

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { FOV, useCameraExternalClock, useCameraControl, alpha } from '../CameraControl';
import type { CameraControlApi } from '../CameraControl';

// 1. 无限渐变背景层 - 永远锁定在相机中心，作为“天空盒”替代品
function InfiniteBackground({ cameraControlApi, z = -2000 }: { cameraControlApi: CameraControlApi, z?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // 核心修复：使用 useMemo 稳定 uniforms，防止 React 重渲染时将 uTime 重置为 0
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color('#d75050') }, // 提亮后的洋红
    uColor2: { value: new THREE.Color('#462f79') }, // 提亮后的靛蓝
    uColor3: { value: new THREE.Color('#5c1a70') }, // 呼吸色
  }), []);

  useFrame((state) => {
    if (meshRef.current) {
      const { orbitCenterX, orbitCenterY } = cameraControlApi.getCameraSnapshot();
      // 让背景板永远跟着相机 XY 走，这样永远看不到边缘
      meshRef.current.position.set(orbitCenterX, orbitCenterY, z);
      
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  const fovRad = (FOV * Math.PI) / 180;
  const scale = Math.abs(z) * Math.tan(fovRad / 2 + alpha) * 2 * 2; // 根据相机 FOV 和距离计算背景板大小

  return (
    <mesh ref={meshRef} scale={[scale, scale, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
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

          float squeeze(float x, float power) {
            float nx = (x - 0.5) * 2.0; // 转换到 -1 ~ 1
            float ny = -0.5 * sign(nx) * (pow(1. - abs(nx), power) - 1.) + 0.5; // 应用幂函数
            return (ny / 2.0) + 0.5; // 转换回 0 ~ 1
          }

          void main() {
            float mixFactor = smoothstep(0.0, 1.0, (1.0 - vUv.x) * 0.8 + (1.0 - vUv.y) * 0.2);
            // 横向压缩一下，让它更集中在中间
            mixFactor = squeeze(mixFactor, 1.0);
            // 添加一些“偏袒”：最理想的渐变出现在更偏暗部(->1)的位置上，把它拉到中心
            mixFactor = pow(mixFactor, 0.85);
            vec3 color = mix(uColor1, uColor2, mixFactor);

            // 动态变化 
            color = mix(color, uColor3, (sin(uTime * 1.) * 0.5 + 0.5) * 0.3);

            // 圆形暗角，增加一些空间感
            float dist = distance(vUv, vec2(0.5));
            // color *= mix(1.0, 0.7, smoothstep(0.2, 1.0, dist)); 
            
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// 2. 无限三角网格层 - 关键：使用世界坐标计算，实现“无限铺展”效果
function InfiniteTriGrid({ 
  cameraControlApi, 
  z = -200, 
  opacity = 0.05,
  gridScale = 50,
  lineWidth = 0.28,
  gridOffset = [0, 0]
}: { 
  cameraControlApi: CameraControlApi, 
  z?: number, 
  opacity?: number,
  gridScale?: number,
  lineWidth?: number,
  gridOffset?: [number, number],
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const uniforms = useMemo(() => ({
    uGridScale: { value: gridScale },
    uOpacity: { value: opacity },
    uLineWidth: { value: lineWidth },
    vGridOffset: { value: new THREE.Vector2(...gridOffset) },
  }), [gridScale, opacity, lineWidth, gridOffset]);

  useFrame(() => {
    if (meshRef.current) {
      const { orbitCenterX, orbitCenterY } = cameraControlApi.getCameraSnapshot();
      // 网格板也跟着相机走，防止边缘露出
      meshRef.current.position.set(orbitCenterX, orbitCenterY, z);
    }
  });

  return (
    <mesh ref={meshRef} scale={[10000, 10000, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        transparent
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vWorldPosition;
          void main() {
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec3 vWorldPosition;
          uniform float uGridScale;
          uniform float uOpacity;
          uniform float uLineWidth;
          uniform vec2 vGridOffset;
          float rotateAngle = radians(55.); // 旋转角度

          float gridline(float x) {
            float halfLineWidth = uLineWidth * 0.5;
            float modPos = mod(x, uGridScale);
            return step(modPos, halfLineWidth) + step(uGridScale - halfLineWidth, modPos);
          }
          
          void main() {
            // 使用世界坐标来计算网格，这样相机移动时网格是静止的
            mat2 rotationMatrix = mat2(cos(rotateAngle), -sin(rotateAngle), sin(rotateAngle), cos(rotateAngle));
            vec2 pos = rotationMatrix * (vWorldPosition.xy - vGridOffset);

            float grid1 = gridline(pos.x);
            float grid2 = gridline(pos.y * 0.866 + pos.x * 0.5);
            float grid3 = gridline(pos.y * 0.866 - pos.x * 0.5);
            
            float grid = grid1 + grid2 + grid3;
            
            // 极微弱的网格线颜色
            vec3 gridLineColor = vec3(1.0, 0.5, 0.7);
            gl_FragColor = vec4(gridLineColor, grid * uOpacity);
          }
        `}
      />
    </mesh>
  );
}

// 3. 背景装饰组
function BackgroundDecorations() {
  const groupRef = useRef<THREE.Group>(null);
  
  const diamonds = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 150,
        -50 - Math.random() * 200
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
    <group ref={groupRef}>
      {diamonds.map((d, i) => (
        <mesh key={i} position={d.position} scale={d.scale}>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial 
            color={i % 2 === 0 ? "#00ffff" : "#ff00ff"} 
            transparent 
            opacity={0.06}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            wireframe={i % 3 === 0}
          />
        </mesh>
      ))}
    </group>
  );
}

// 相机同步
function CameraSync({ cameraControlApi }: { cameraControlApi: CameraControlApi }) {
  const { camera } = useThree();
  const cameraControlTick = cameraControlApi.useCameraExternalClock();
  
  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    cameraControlTick();
    const { orbitCenterX, orbitCenterY, radius, theta, phi } = cameraControlApi.getCameraSnapshot();
    camera.position.setFromSphericalCoords(radius, phi, theta);
    camera.position.x += orbitCenterX;
    camera.position.y += orbitCenterY;
    camera.lookAt(orbitCenterX, orbitCenterY, 0);
  });
  
  return null;
}

export function Scene3D() {
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
        camera={{ 
          position: [0, 0, 30], 
          fov: FOV,
          near: 0.1,
          far: 10000 // 大幅提升远平面裁切距离
        }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <CameraSync cameraControlApi={cameraControlApi} />
        
        {/* 背景渐变层 - 最远层 */}
        <InfiniteBackground cameraControlApi={cameraControlApi} z={-5000} />
        
        {/* 远景网格 - Z=800, 极微弱 */}
        <InfiniteTriGrid cameraControlApi={cameraControlApi} z={-1200} opacity={0.04} gridScale={525} lineWidth={1.2} gridOffset={[80, 0]} />
        
        {/* 近景网格 - Z=200, 较清晰 */}
        <InfiniteTriGrid cameraControlApi={cameraControlApi} z={-400} opacity={0.05} gridScale={150} lineWidth={0.8} />
        
        {/* 悬浮装饰物 */}
        <BackgroundDecorations />
        
        {/* 星星 */}
        <Stars radius={300} depth={100} count={4000} factor={4} saturation={0.5} fade />
      </Canvas>
    </div>
  );
}

export default Scene3D;
