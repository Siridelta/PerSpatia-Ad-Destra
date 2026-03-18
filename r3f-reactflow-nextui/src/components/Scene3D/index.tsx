import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

// 3D 背景效果组件
function BackgroundEffects() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += 0.0005;
      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = state.clock.elapsedTime;
      }
    }
  });

  return (
    <>
      {/* 渐变背景平面 */}
      <mesh ref={meshRef} position={[0, 0, -50]} scale={[100, 100, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          uniforms={{
            uTime: { value: 0 },
            uColor1: { value: new THREE.Color('#1a0a2e') },  // 深紫
            uColor2: { value: new THREE.Color('#16213e') },  // 深蓝
            uColor3: { value: new THREE.Color('#0f3460') },  // 蓝
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
              // 对角渐变
              float mixFactor = vUv.x * 0.7 + vUv.y * 0.3;
              vec3 color = mix(uColor1, uColor2, mixFactor);
              color = mix(color, uColor3, sin(uTime * 0.2) * 0.1 + 0.1);
              
              // 添加微妙的网格线
              float gridX = step(0.98, fract(vUv.x * 20.0));
              float gridY = step(0.98, fract(vUv.y * 20.0));
              float grid = max(gridX, gridY) * 0.05;
              
              gl_FragColor = vec4(color + grid, 1.0);
            }
          `}
        />
      </mesh>
      
      {/* 漂浮的菱形 */}
      <FloatingDiamonds />
      
      {/* 星星粒子 */}
      <Stars 
        radius={100} 
        depth={50} 
        count={1000} 
        factor={4} 
        saturation={0.5} 
        fade 
      />
    </>
  );
}

// 漂浮菱形组件
function FloatingDiamonds() {
  const groupRef = useRef<THREE.Group>(null);
  
  const diamonds = React.useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 60,
        -20 - Math.random() * 30
      ] as [number, number, number],
      scale: 0.5 + Math.random() * 1.5,
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
            color="#e94560" 
            transparent 
            opacity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

// 摄像机控制器
function CameraController() {
  const { camera } = useThree();
  
  useEffect(() => {
    // 初始角度：轻微俯视
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <OrbitControls
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      mouseButtons={{
        LEFT: undefined,      // 左键：React Flow 处理
        // MIDDLE: THREE.MOUSE.DOLLY,  // 中键：缩放
        RIGHT: THREE.MOUSE.ROTATE   // 右键：旋转
      }}
      minDistance={10}
      maxDistance={100}
      maxPolarAngle={Math.PI / 6 * 4} // 限制俯视角度，避免看到地面
      minPolarAngle={Math.PI / 6 * 2}
      maxAzimuthAngle={Math.PI / 6 * 1.5}
      minAzimuthAngle={-Math.PI / 6 * 1.5}
    />
  );
}

// 主场景组件
interface Scene3DProps {
  children: React.ReactNode;
}

export function Scene3D({ children }: Scene3DProps) {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 30], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <CameraController />
        <BackgroundEffects />
        
        {/* React Flow 嵌入 3D 场景 */}
        <Html
          transform
          // occlude={false}
          style={{
            width: '100vw',
            height: '100vh',
            pointerEvents: 'auto',
          }}
        >
          {children}
        </Html>
      </Canvas>
    </div>
  );
}
