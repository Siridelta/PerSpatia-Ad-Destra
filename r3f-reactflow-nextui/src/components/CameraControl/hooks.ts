import { useEffect, useMemo } from 'react';
import { useCameraControlStore } from './CameraControl';
import type { CameraState, CameraStore } from './cameraStore';
import { useStore } from 'zustand';

/**
 * 专门用于读取相机的最终输出表现（供 R3F 和 CSS 使用）。
 * 这是一个干净的数据钩子，隐藏了底层 Store 的细节。
 */
export const useCameraState = () => {
  const store = useCameraControlStore();
  return useStore(store, s => s.cameraState);
};

/**
 * 专门暴露给输入层或外部控制层的方法。
 * 隐藏掉 input 和 physics 这些只属于 tick 循环的私有状态。
 */
export const useCameraActions = () => {
  const store = useCameraControlStore();

  // 使用 useMemo 确保引用稳定，避免不必要的重渲染
  return useMemo(() => ({
    setViewportSize: store.getState().setViewportSize,
    setOptions: store.getState().setOptions,
    setCameraState: store.getState().setCameraState,
    handleKeyDown: store.getState().handleKeyDown,
    handleKeyUp: store.getState().handleKeyUp,
    startPan: store.getState().startPan,
    startRotate: store.getState().startRotate,
    handlePointerMove: store.getState().handlePointerMove,
    handlePointerUp: store.getState().handlePointerUp,
    handleWheel: store.getState().handleWheel,
  }), [store]);
};

/**
 * 声明式的高性能旁路订阅。
 * 用于在相机状态变化时执行非 React 渲染逻辑（如直接操作 DOM）。
 * 
 * @param callback 状态变化时的回调函数
 * @param selector 可选的 selector，用于细粒度订阅
 * @param explicitStore 可选的 store，用于跨 R3F Context
 */
export function useCameraSubscribe<T = CameraState>(
  callback: (state: T, previousState: T) => void,
  selector: (state: CameraState) => T,
): void;
export function useCameraSubscribe(
  callback: (state: CameraState, previousState: CameraState) => void,
): void;
export function useCameraSubscribe<T = CameraState>(
  callback: (state: T, previousState: T) => void,
  selector?: (state: CameraState) => T,
) {
  const store = useCameraControlStore();

  useEffect(() => {
    // 默认订阅 cameraState
    const targetSelector = selector || ((s: any) => s) as unknown as (state: CameraState) => T;

    // 使用 Zustand 的 subscribe 方法
    const unsubscribe = store.subscribe((s, p) => {
      const selectedCurrent = targetSelector(s.cameraState);
      const selectedPrev = targetSelector(p.cameraState);
      if (selectedCurrent !== selectedPrev) {
        callback(selectedCurrent, selectedPrev);
      }
    });
    return unsubscribe;
  }, [store, callback, selector]);
}

/**
 * 返回一个可供外界驱动的 tick 方法
 */
export function useCameraExternalClock() {
  const store = useCameraControlStore();
  return store.getState().tick;
}

export type CameraControlApi = {
  useCameraState: typeof useCameraState,
  actions: ReturnType<typeof useCameraActions>,
  useCameraSubscribe: typeof useCameraSubscribe,
  useCameraExternalClock: typeof useCameraExternalClock,
  getCameraSnapshot: () => CameraState,
}
export function useCameraControl() {
  const store = useCameraControlStore();
  const getCameraSnapshot = () => {
    return store.getState().cameraState;
  }
  
  const actions = useCameraActions();
  return {
    useCameraState,
    actions,
    useCameraSubscribe,
    useCameraExternalClock,
    getCameraSnapshot
  }
}
