import { useEffect } from 'react';

// todo: a complete 3d coordinate system; it is also required if we need to make 3d animated background;

interface InertialPanOptions {
  setViewport: (v: { x: number; y: number; zoom: number }) => void;
  getViewport: () => { x: number; y: number; zoom: number };
}

const keyDirectionMap: Record<string, { x: number; y: number }> = {
  a: { x: 1, y: 0 }, A: { x: 1, y: 0 },
  d: { x: -1, y: 0 }, D: { x: -1, y: 0 },
  w: { x: 0, y: 1 }, W: { x: 0, y: 1 },
  s: { x: 0, y: -1 }, S: { x: 0, y: -1 },
  // Ctrl + Arrow Keys 支持
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 },
};

// 缩放快捷键映射
const zKeyMap: Record<string, number> = {
  ArrowUp: 1,    // 放大
  ArrowDown: -1,  // 缩小
};

export default function useInertialPan({ setViewport, getViewport }: InertialPanOptions) {
  useEffect(() => {
    const config = {
      move: { vmax: 10, vmin: 0.5, acc: 2, dec: 0.5 },
      z: { vmax: 0.03, vmin: 0.0005, acc: 0.02, dec: 0.01, max: 10, min: 1 / 3 },
    };
    const direction = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    let zDirection = 0;
    let zVelocity = 0;
    // 通过z维护缩放的倒数，避免直接修改viewport中的zoom值
    const initialViewport = getViewport();
    const initialZoom = initialViewport.zoom === 0 ? 1 : initialViewport.zoom;
    let z = 1 / initialZoom;
    let rafId: number | null = null;

    function updateVelocity(axis: 'x' | 'y') {
      if (direction[axis] !== 0) {
        velocity[axis] += config.move.acc * direction[axis];
        if (Math.abs(velocity[axis]) > config.move.vmax) velocity[axis] = config.move.vmax * direction[axis];
      } else {
        if (velocity[axis] > 0) velocity[axis] = Math.max(0, velocity[axis] - config.move.dec);
        if (velocity[axis] < 0) velocity[axis] = Math.min(0, velocity[axis] + config.move.dec);
        if (Math.abs(velocity[axis]) < config.move.vmin) velocity[axis] = 0;
      }
    }

    function updateZVelocity() {
      // 由于实际zoom为1/z，需要反向加速以保持按键语义一致
      if (zDirection !== 0) {
        zVelocity += config.z.acc * -zDirection;
        if (Math.abs(zVelocity) > config.z.vmax) zVelocity = config.z.vmax * -zDirection;
      } else {
        if (zVelocity > 0) zVelocity = Math.max(0, zVelocity - config.z.dec);
        if (zVelocity < 0) zVelocity = Math.min(0, zVelocity + config.z.dec);
        if (Math.abs(zVelocity) < config.z.vmin) zVelocity = 0;
      }
    }

    function animate() {
      updateVelocity('x');
      updateVelocity('y');
      updateZVelocity();
      
      let hasChanges = false;
      
      if (velocity.x !== 0 || velocity.y !== 0) {
        const { x, y, zoom } = getViewport();
        setViewport({ x: x + velocity.x, y: y + velocity.y, zoom });
        hasChanges = true;
      }
      
      if (zVelocity !== 0) {
        const { x, y, zoom } = getViewport();
        // 调整z并限制其范围
        z += zVelocity;
        if (z < config.z.min) {
          z = config.z.min;
          zVelocity = 0;
        }
        if (z > config.z.max) {
          z = config.z.max;
          zVelocity = 0;
        }

        const newZoom = 1 / z;
        
        // 以视口中心为原点进行缩放，保持体验一致
        const zoomRatio = newZoom / zoom;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // 计算新的位置，保持视口中心不变
        const newX = centerX - (centerX - x) * zoomRatio;
        const newY = centerY - (centerY - y) * zoomRatio;
        
        setViewport({ x: newX, y: newY, zoom: newZoom });
        hasChanges = true;
      }
      
      if (velocity.x !== 0 || velocity.y !== 0 || direction.x !== 0 || direction.y !== 0 || 
          zVelocity !== 0 || zDirection !== 0) {
        rafId = requestAnimationFrame(animate);
      } else {
        rafId = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // 检查是否是 Ctrl + Arrow Keys（在编辑状态下也可用）
      const isCtrlArrow = e.ctrlKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      // 检查是否是 Ctrl + Shift + Arrow Up/Down（缩放）
      const isCtrlShiftZoom = e.ctrlKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
      
      // 如果不是 Ctrl + Arrow Keys 或 Ctrl + Shift + Arrow Up/Down，且编辑区聚焦则不响应
      if (!isCtrlArrow && !isCtrlShiftZoom) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        const isEditable = (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable);
        if (isEditable) return;
      }
      
      // 处理移动
      if (keyDirectionMap[e.key] && !isCtrlShiftZoom) {
        const dir = keyDirectionMap[e.key];
        if (dir.x !== 0 && direction.x !== dir.x) direction.x = dir.x;
        if (dir.y !== 0 && direction.y !== dir.y) direction.y = dir.y;
        if (!rafId) rafId = requestAnimationFrame(animate);
        e.preventDefault();
      }
      
      // 处理缩放
      if (isCtrlShiftZoom && zKeyMap[e.key]) {
        const zoomDir = zKeyMap[e.key];
        if (zDirection !== zoomDir) zDirection = zoomDir;
        if (!rafId) rafId = requestAnimationFrame(animate);
        e.preventDefault();
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      // 处理移动键释放
      if (keyDirectionMap[e.key]) {
        const dir = keyDirectionMap[e.key];
        if (dir.x !== 0 && direction.x === dir.x) direction.x = 0;
        if (dir.y !== 0 && direction.y === dir.y) direction.y = 0;
      }
      
      // 处理缩放键释放
      if (e.ctrlKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        zDirection = 0;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [setViewport, getViewport]);
} 