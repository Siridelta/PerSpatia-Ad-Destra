import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Scene3D 组件
 * 
 * 架构说明：
 * 这是一个"伪 3D 深度"场景。ReactFlow 的 HTML 元素作为一个固定的"显示屏"嵌入在 3D 场景中，
 * 而 3D 背景元素（菱形、星星、渐变平面）则与 ReactFlow 同步缩放。
 * 
 * 伪缩放机制：
 * - 当用户滚轮"放大"时，ReactFlow 内容变大，3D 背景元素也同步变大
 * - 当用户滚轮"缩小"时，ReactFlow 内容变小，3D 背景元素也同步变小
 * - 摄像机位置固定，不参与缩放变化
 * 
 * 所有可缩放的 3D 元素都放在 ScalableGroup 中统一管理。
 */

// 3D 场景缩放组接口
export interface Scene3DRef {
  /** 设置场景缩放系数 (0.1 ~ 10) */
  setScale: (scale: number) => void;
}


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
      {/* 渐变背景平面 - 放在很远的距离，这样缩放时变化不明显 */}
      <mesh ref={meshRef} position={[0, 0, -80]} scale={[200, 200, 1]}>
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
      
      {/* 星星粒子 - 半径很大，缩放时产生视差 */}
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

// 漂浮菱形组件 - 这些是前景元素，缩放效果明显
function FloatingDiamonds() {
  const groupRef = useRef<THREE.Group>(null);
  
  const diamonds = React.useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 120,
        (Math.random() - 0.5) * 80,
        -10 - Math.random() * 60  // 分布在不同深度
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
    // 固定摄像机位置，不跟随缩放变化
    // 这样 ReactFlow HTML 元素在屏幕上的大小保持不变
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <OrbitControls
      enablePan={false}      // 禁用平移，由 ReactFlow 接管
      enableZoom={false}     // 禁用缩放，由伪缩放系统接管
      enableRotate={true}    // 保留右键旋转
      enableKeys={false}     // 禁用键盘控制
      mouseButtons={{
        LEFT: undefined,     // 左键：React Flow 处理
        RIGHT: THREE.MOUSE.ROTATE  // 右键：旋转
      }}
      minPolarAngle={Math.PI / 6 * 2}
      maxPolarAngle={Math.PI / 6 * 4}
      minAzimuthAngle={-Math.PI / 6 * 1.5}
      maxAzimuthAngle={Math.PI / 6 * 1.5}
    />
  );
}

// 可缩放组组件 - 必须在 Canvas 内部使用
interface ScalableGroupProps {
  children: React.ReactNode;
  initialScale: number;
  scaleRef: React.RefObject<number>;
}

function ScalableGroup({ children, initialScale, scaleRef }: ScalableGroupProps) {
  const groupRef = useRef<THREE.Group>(null);
  const currentScaleRef = useRef(initialScale);

  useFrame(() => {
    if (groupRef.current && scaleRef.current !== undefined) {
      const target = scaleRef.current;
      const current = currentScaleRef.current;
      const diff = target - current;
      if (Math.abs(diff) > 0.001) {
        currentScaleRef.current = current + diff * 0.15;
        groupRef.current.scale.setScalar(currentScaleRef.current);
      }
    }
  });

  return <group ref={groupRef} scale={initialScale}>{children}</group>;
}

// 主场景组件
interface Scene3DProps {
  children: React.ReactNode;
  /** 场景缩放系数 (0.1 ~ 10)，与 pseudoZoom 相反：scale = 1 / pseudoZoom */
  sceneScale?: number;
}

export const Scene3D = forwardRef<Scene3DRef, Scene3DProps>(
  function Scene3D({ children, sceneScale = 1 }, ref) {
    const targetScaleRef = useRef(sceneScale);

    // 暴露 setScale 方法
    useImperativeHandle(ref, () => ({
      setScale: (scale: number) => {
        targetScaleRef.current = scale;
      },
    }));

    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        overflow: 'hidden'  // 防止出现滚动条
      }}>
        <Canvas
          camera={{ position: [0, 0, 30], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <CameraController />

          {/* 所有可缩放的 3D 元素放在这个组里 */}
          <ScalableGroup initialScale={sceneScale} scaleRef={targetScaleRef}>
            <BackgroundEffects />
          </ScalableGroup>

          {/* React Flow 嵌入 3D 场景 - 固定大小，不参与 3D 缩放 */}
          <Html
            transform
            style={{
              width: '100vw',
              height: '100vh',
              pointerEvents: 'auto',
              // ReactFlow 容器本身不缩放，由内部处理
            }}
          >
            {children}
          </Html>
        </Canvas>
      </div>
    );
  }
);

export default Scene3D;
