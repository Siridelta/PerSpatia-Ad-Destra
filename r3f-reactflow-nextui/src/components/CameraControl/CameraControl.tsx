/**
 * CameraControl — 单张画布内的相机 SSOT：创建 Zustand store、挂 Context、暴露 ref 命令式 API。
 *
 * - 指针/滚轮事件仍由 ReactFlow3D 等子组件冒泡写入 store（与此前一致）。
 * - tick() 仍在 R3F useFrame 中调用（Scene3D），保证与 WebGL 渲染同一条时间轴。
 */

import React, {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useRef,
} from 'react';
import { useStore } from 'zustand';

import {
  createCameraStore,
  type CameraState,
  type CameraStore,
  type CameraStoreApi,
} from './cameraStore';

/** 供 `useCameraControlStore` / 可选的跨层读取使用 */
export const CameraControlContext = createContext<CameraStoreApi | null>(null);

export interface CameraControlRef {
  getCameraState: () => CameraState;
  setCameraState: (patch: Partial<CameraState>) => void;
}

export const CameraControl = forwardRef<CameraControlRef, { children: React.ReactNode }>(
  function CameraControl({ children }, ref) {
    const storeRef = useRef<CameraStoreApi | null>(null);
    if (!storeRef.current) {
      storeRef.current = createCameraStore();
    }
    const store = storeRef.current;

    useImperativeHandle(
      ref,
      () => ({
        getCameraState: () => store.getState().cameraState,
        setCameraState: (patch) => {
          store.getState().setCameraState(patch);
        },
      }),
      [store]
    );

    return (
      <CameraControlContext.Provider value={store}>{children}</CameraControlContext.Provider>
    );
  }
);

/**
 * 当前画布对应的 vanilla Zustand API（getState / subscribe）。
 * R3F `<Canvas>` 内子树可能拿不到 React Context，需在 Canvas 外取到再 props 传入。
 */
export function useCameraControlStore(): CameraStoreApi {
  const store = useContext(CameraControlContext);
  if (!store) {
    throw new Error('useCameraControlStore must be used within <CameraControl>');
  }
  return store;
}

/** 在函数组件中按 selector 订阅相机 store（与旧版 useCameraStore 用法相同） */
export function useCameraControl<T>(selector: (state: CameraStore) => T): T {
  const store = useCameraControlStore();
  return useStore(store, selector);
}
