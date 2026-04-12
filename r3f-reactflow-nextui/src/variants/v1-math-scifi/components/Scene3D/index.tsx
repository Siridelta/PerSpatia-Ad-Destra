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
import { FOV, useCameraExternalClock, useCameraControl } from '../CameraControl';
import type { CameraControlApi } from '../CameraControl';

// 1. 无限渐变背景层 - 永远锁定在相机中心，作为“天空盒”替代品
function InfiniteBackground({ cameraControlApi }: { cameraControlApi: CameraControlApi }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const { orbitCenterX, orbitCenterY } = cameraControlApi.getCameraSnapshot();
      // 让背景板永远跟着相机 XY 走，这样永远看不到边缘
      meshRef.current.position.set(orbitCenterX, orbitCenterY, -200);
      
      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = state.clock.elapsedTime;
      }
    }
  });

  return (
    <mesh ref={meshRef} scale={[1500, 1500, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={{
          uTime: { value: 0 },
          uColor1: { value: new THREE.Color('#ec6f9d') },
          uColor2: { value: new THREE.Color('#1e1a5e') },
          uColor3: { value: new THREE.Color('#4c125c') },
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

          float squeeze(float x, float power) {
            float nx = (x - 0.5) * 2.0; // 转换到 -1 ~ 1
            float ny = -0.5 * sign(nx) * (pow(1. - abs(nx), power) - 1.) + 0.5; // 应用幂函数
            return (ny / 2.0) + 0.5; // 转换回 0 ~ 1
          }

          void main() {
            float mixFactor = smoothstep(0.0, 1.0, vUv.x * 0.8 + (1.0 - vUv.y) * 0.2);
            // 横向压缩一下，让它更集中在中间
            mixFactor = squeeze(mixFactor, 2.5);
            // 添加一些“偏袒”：最理想的渐变出现在更偏暗部(->1)的位置上，把它拉到中心
            mixFactor = pow(mixFactor, 0.85);
            vec3 color = mix(uColor1, uColor2, mixFactor);

            // 动态变化 
            color = mix(color, uColor3, (sin(uTime * 2.) * 0.5 + 0.5) * 0.);

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
function InfiniteTriGrid({ cameraControlApi }: { cameraControlApi: CameraControlApi }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      const { orbitCenterX, orbitCenterY } = cameraControlApi.getCameraSnapshot();
      // 网格板也跟着相机走，防止边缘露出
      meshRef.current.position.set(orbitCenterX, orbitCenterY, -100);
    }
  });

  return (
    <mesh ref={meshRef} scale={[2000, 2000, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        transparent
        uniforms={{
          uGridScale: { value: 0.04 }, // 控制网格大小
        }}
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

          float gridline(float x) {
            float lineWidth = 0.007; // 网格线宽度
            float halfLineWidth = lineWidth * 0.5;
            float modPos = fract(x);
            return step(modPos, halfLineWidth) + step(1.0 - halfLineWidth, modPos);
          }
          
          void main() {
            // 使用世界坐标来计算网格，这样相机移动时网格是静止的
            vec2 pos = vWorldPosition.xy * uGridScale;
            
            float grid1 = gridline(pos.x);
            float grid2 = gridline(pos.y * 0.866 + pos.x * 0.5);
            float grid3 = gridline(pos.y * 0.866 - pos.x * 0.5);
            
            float grid = grid1 + grid2 + grid3;
            
            // 极微弱的网格线颜色
            vec3 gridLineColor = vec3(1.0, 0.5, 0.7);
            gl_FragColor = vec4(gridLineColor, grid * 0.05); // 5% 透明度
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
        (Math.random() - 0.5) * 150,
        (Math.random() - 0.5) * 100,
        -50 - Math.random() * 100
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
        camera={{ position: [0, 0, 30], fov: FOV }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <CameraSync cameraControlApi={cameraControlApi} />
        
        {/* 背景渐变层 - 最远 */}
        <InfiniteBackground cameraControlApi={cameraControlApi} />
        
        {/* 三角网格层 - 较远 */}
        <InfiniteTriGrid cameraControlApi={cameraControlApi} />
        
        {/* 悬浮装饰物 - 较近 */}
        <BackgroundDecorations />
        
        {/* 星星 */}
        <Stars radius={200} depth={50} count={3000} factor={4} saturation={0.5} fade />
      </Canvas>
    </div>
  );
}

export default Scene3D;
