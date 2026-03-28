/**
 * CameraControl — 单张画布内的相机：Zustand store、Context、全屏输入层、ref。
 *
 * - 全屏 div（pointer-events: none）承接冒泡，写入 store；`shouldIgnoreCameraForTarget` 由外层注入（如 pointerPolicy），本文件不写 RF 类名。
 * - 右键菜单：仅当「允许相机接管」的目标上才 preventDefault，避免挡工具栏等。
 * - tick() 仍在 R3F useFrame（Scene3D）里跑。
 */

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';

import {
  createCameraStore,
  type CameraState,
  type CameraStore,
  type CameraStoreApi,
} from './cameraStore';

export const CameraControlContext = createContext<CameraStoreApi | null>(null);

export interface CameraControlRef {
  getCameraState: () => CameraState;
  setCameraState: (patch: Partial<CameraState>) => void;
}

export interface CameraControlProps {
  children: React.ReactNode;
  /**
   * 初始相机状态，在组件挂载时应用。
   */
  persistedCamera?: Partial<CameraState>;
  /**
   * true → 本次交互不交给相机（不平移/旋转、不滚轮缩放、不拦右键菜单）。
   * 传入 `pointerPolicy` 里基于 `event.target` 的实现即可，例如 `shouldIgnorePointerForCameraRf`。
   */
  pointerPolicy?: (target: EventTarget | null) => boolean;
  /**
   * 在 keyup / pointerup 以及切页、关页等时刻把当前相机写入画布 API（低频，非 RAF）。
   * 由外层接入 `writeCamera.setCamera`，供 localStorage 等持久化订阅。
   */
  onPersist?: (camera: CameraState) => void;
}

export const CameraControl = ({ children, persistedCamera, pointerPolicy, onPersist }: CameraControlProps) => {
  // store ref
  const storeRef = useRef<CameraStoreApi | null>(null);
  if (!storeRef.current) {
    storeRef.current = createCameraStore();
  }
  const store = storeRef.current;

  // persist state down
  useEffect(() => {
    if (persistedCamera) {
      store.getState().setCameraState(persistedCamera);
    }
  }, [persistedCamera, store]);

  const shouldIgnore = pointerPolicy ?? (() => false);

  const flushPersist = useCallback(() => {
    onPersist?.(store.getState().cameraState);
  }, [onPersist, store]);

  /** 视口尺寸：供 CSS perspective 与 RF 坐标换算；与画布窗口一致 */
  useEffect(() => {
    const onResize = () => {
      store.getState().setViewportSize(window.innerWidth, window.innerHeight);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [store]);

  /**
   * WASD 等键盘相机：仅在非可编辑焦点时生效。
   * 工具快捷键（V/T/C、Ctrl+S 等）仍由 Canvas 处理。
   */
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      store.getState().handleKeyDown(e.key.toLowerCase());
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      store.getState().handleKeyUp(e.key.toLowerCase());
      flushPersist();
    };

    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    return () => {
      window.removeEventListener('keydown', onKeyDown, false);
      window.removeEventListener('keyup', onKeyUp, false);
    };
  }, [store, flushPersist]);

  /** 关 tab / 刷新 / 合盖等：尽力把最后一帧相机推给持久化层 */
  useEffect(() => {
    if (!onPersist) return;

    const onVis = () => {
      if (document.visibilityState === 'hidden') flushPersist();
    };
    const onPageHide = () => flushPersist();
    const onBeforeUnload = () => flushPersist();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [onPersist, flushPersist]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (shouldIgnore(e.target)) {
        return;
      }

      if (e.button === 2) {
        store.getState().startRotate(e.clientX, e.clientY);
        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        // e.preventDefault();
        store.getState().startPan(e.clientX, e.clientY);
      }
    },
    [store, shouldIgnore]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = store.getState();
      if (state.input.isPanning || state.input.isRotating) {
        state.handlePointerMove(e.clientX, e.clientY);
      }
    },
    [store]
  );

  const handlePointerUp = useCallback(() => {
    store.getState().handlePointerUp();
    flushPersist();
  }, [store, flushPersist]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const target = e.target as Element;
      // if (
      //   target.tagName?.toLowerCase() === 'input' ||
      //   target.tagName?.toLowerCase() === 'textarea' ||
      //   (target as HTMLElement).isContentEditable
      // ) {
      //   return;
      // }
      // // if (shouldIgnore(e.target)) {
      // //   return;
      // // }
      store.getState().handleWheel(e.deltaY);
      e.preventDefault();
    },
    [store, shouldIgnore]
  );

  /** 仅「相机应接管」的区域拦系统右键；工具栏等保持默认菜单 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (shouldIgnore(e.target)) {
        return;
      }
      e.preventDefault();
    },
    [shouldIgnore]
  );

  return (
    <CameraControlContext.Provider value={store}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
    </CameraControlContext.Provider>
  );
}

export function useCameraControlStore(): CameraStoreApi {
  const store = useContext(CameraControlContext);
  if (!store) {
    throw new Error('useCameraControlStore must be used within <CameraControl>');
  }
  return store;
}

export function useCameraControl<T>(selector: (state: CameraStore) => T): T {
  const store = useCameraControlStore();
  return useStore(store, selector);
}
