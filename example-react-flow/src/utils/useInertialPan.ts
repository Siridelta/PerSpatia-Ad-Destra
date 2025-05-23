import { useEffect } from 'react';

interface InertialPanOptions {
  setViewport: (v: { x: number; y: number; zoom: number }) => void;
  getViewport: () => { x: number; y: number; zoom: number };
}

const keyDirectionMap: Record<string, { x: number; y: number }> = {
  a: { x: 1, y: 0 }, A: { x: 1, y: 0 },
  d: { x: -1, y: 0 }, D: { x: -1, y: 0 },
  w: { x: 0, y: 1 }, W: { x: 0, y: 1 },
  s: { x: 0, y: -1 }, S: { x: 0, y: -1 },
  // 可扩展方向键
};

export default function useInertialPan({ setViewport, getViewport }: InertialPanOptions) {
  useEffect(() => {
    const config = { max: 30, acc: 4, dec: 3, min: 0.5 };
    const direction = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
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

    function animate() {
      updateVelocity('x');
      updateVelocity('y');
      if (velocity.x !== 0 || velocity.y !== 0) {
        const { x, y, zoom } = getViewport();
        setViewport({ x: x + velocity.x, y: y + velocity.y, zoom });
      }
      if (velocity.x !== 0 || velocity.y !== 0 || direction.x !== 0 || direction.y !== 0) {
        rafId = requestAnimationFrame(animate);
      } else {
        rafId = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // 编辑区聚焦时不响应
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable);
      if (isEditable) return;
      if (keyDirectionMap[e.key]) {
        const dir = keyDirectionMap[e.key];
        if (dir.x !== 0 && direction.x !== dir.x) direction.x = dir.x;
        if (dir.y !== 0 && direction.y !== dir.y) direction.y = dir.y;
        if (!rafId) rafId = requestAnimationFrame(animate);
        e.preventDefault();
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (keyDirectionMap[e.key]) {
        const dir = keyDirectionMap[e.key];
        if (dir.x !== 0 && direction.x === dir.x) direction.x = 0;
        if (dir.y !== 0 && direction.y === dir.y) direction.y = 0;
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