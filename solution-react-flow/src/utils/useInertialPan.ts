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
const zoomKeyMap: Record<string, number> = {
  ArrowUp: 1,    // 放大
  ArrowDown: -1,  // 缩小
};

export default function useInertialPan({ setViewport, getViewport }: InertialPanOptions) {
  useEffect(() => {
    const config = { max: 30, acc: 4, dec: 3, min: 0.5 };
    const zoomConfig = { max: 0.1, acc: 0.02, dec: 0.01, min: 0.0005 };
    const direction = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    let zoomDirection = 0;
    let zoomVelocity = 0;
    let rafId: number | null = null;

    function updateVelocity(axis: 'x' | 'y') {
      if (direction[axis] !== 0) {
        velocity[axis] += config.acc * direction[axis];
        if (Math.abs(velocity[axis]) > config.max) velocity[axis] = config.max * direction[axis];
      } else {
        if (velocity[axis] > 0) velocity[axis] = Math.max(0, velocity[axis] - config.dec);
        if (velocity[axis] < 0) velocity[axis] = Math.min(0, velocity[axis] + config.dec);
        if (Math.abs(velocity[axis]) < config.min) velocity[axis] = 0;
      }
    }

    function updateZoomVelocity() {
      if (zoomDirection !== 0) {
        zoomVelocity += zoomConfig.acc * zoomDirection;
        if (Math.abs(zoomVelocity) > zoomConfig.max) zoomVelocity = zoomConfig.max * zoomDirection;
      } else {
        if (zoomVelocity > 0) zoomVelocity = Math.max(0, zoomVelocity - zoomConfig.dec);
        if (zoomVelocity < 0) zoomVelocity = Math.min(0, zoomVelocity + zoomConfig.dec);
        if (Math.abs(zoomVelocity) < zoomConfig.min) zoomVelocity = 0;
      }
    }

    function animate() {
      updateVelocity('x');
      updateVelocity('y');
      updateZoomVelocity();
      
      let hasChanges = false;
      
      if (velocity.x !== 0 || velocity.y !== 0) {
        const { x, y, zoom } = getViewport();
        setViewport({ x: x + velocity.x, y: y + velocity.y, zoom });
        hasChanges = true;
      }
      
      if (zoomVelocity !== 0) {
        const { x, y, zoom } = getViewport();
        const newZoom = Math.max(0.1, Math.min(3.0, zoom + zoomVelocity));
        
        // 以视口中心为原点进行缩放
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
          zoomVelocity !== 0 || zoomDirection !== 0) {
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
      if (isCtrlShiftZoom && zoomKeyMap[e.key]) {
        const zoomDir = zoomKeyMap[e.key];
        if (zoomDirection !== zoomDir) zoomDirection = zoomDir;
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
        zoomDirection = 0;
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