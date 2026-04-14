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
import { useControls as useLevaControls } from 'leva';

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

  const activePointers = useRef(new Map<number, { x: number; y: number; target?: EventTarget }>());
  const touchStartDistance = useRef<number | null>(null);

  // Leva controls
  useLevaControls('Mobile Touch & Camera', () => ({
    twoFingerRotate: {
      value: store.getState().options.twoFingerRotate,
      onChange: (v: boolean) => store.getState().setOptions({ twoFingerRotate: v }),
    },
    panDamping: {
      value: store.getState().options.panDamping,
      min: 0, max: 0.99,
      onChange: (v: number) => store.getState().setOptions({ panDamping: v }),
    },
    rotateDamping: {
      value: store.getState().options.rotateDamping,
      min: 0, max: 0.99,
      onChange: (v: number) => store.getState().setOptions({ rotateDamping: v }),
    },
    zoomDamping: {
      value: store.getState().options.zoomDamping,
      min: 0, max: 0.99,
      onChange: (v: number) => store.getState().setOptions({ zoomDamping: v }),
    },
  }));

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

  const resetPointersBase = useCallback(() => {
    // 清除上一个手势的状态（触发惯性并关闭 isPanning / isRotating）
    store.getState().handlePointerUp();

    if (activePointers.current.size === 0) {
      touchStartDistance.current = null;
      return;
    }
    
    let sumX = 0, sumY = 0;
    activePointers.current.forEach((p) => {
      sumX += p.x;
      sumY += p.y;
    });
    const centroidX = sumX / activePointers.current.size;
    const centroidY = sumY / activePointers.current.size;

    if (activePointers.current.size === 1) {
      store.getState().startPan(centroidX, centroidY);
    } else if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      touchStartDistance.current = dist;

      if (store.getState().options.twoFingerRotate) {
        store.getState().startRotate(centroidX, centroidY);
      } else {
        store.getState().startPan(centroidX, centroidY);
      }
    } else if (activePointers.current.size >= 3) {
      if (store.getState().options.twoFingerRotate) {
        store.getState().startPan(centroidX, centroidY);
      } else {
        store.getState().startRotate(centroidX, centroidY);
      }
    }
  }, [store]);

  const handlePointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') {
        if (shouldIgnore(e.target)) return;

        if (e.button === 2) {
          store.getState().startRotate(e.clientX, e.clientY);
          e.preventDefault();
          return;
        }
        if (e.button === 0) {
          store.getState().startPan(e.clientX, e.clientY);
        }
        return;
      }

      // Touch
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target });

      if (activePointers.current.size >= 2) {
        e.stopPropagation();
        e.nativeEvent.stopPropagation();
        
        activePointers.current.forEach((data, id) => {
          try {
            if (data.target && (data.target as HTMLElement).setPointerCapture) {
              (data.target as HTMLElement).setPointerCapture(id);
            }
          } catch (err) {}
        });
        resetPointersBase();
      } else {
        // 单指
        if (shouldIgnore(e.target)) {
          // 不接管
          return;
        } else {
          // 接管
          try {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          } catch (err) {}
          resetPointersBase();
        }
      }
    },
    [store, shouldIgnore, resetPointersBase]
  );

  const handlePointerMoveCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') {
        const state = store.getState();
        if (state.input.isPanning || state.input.isRotating) {
          state.handlePointerMove(e.clientX, e.clientY);
          e.stopPropagation();
        }
        return;
      }

      if (!activePointers.current.has(e.pointerId)) return;

      const prevData = activePointers.current.get(e.pointerId)!;
      activePointers.current.set(e.pointerId, { ...prevData, x: e.clientX, y: e.clientY });

      const size = activePointers.current.size;
      const isCaptured = (e.target as HTMLElement).hasPointerCapture?.(e.pointerId);

      if (size >= 2 || isCaptured) {
        if (size >= 2) {
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
        }

        let sumX = 0, sumY = 0;
        activePointers.current.forEach((p) => {
          sumX += p.x;
          sumY += p.y;
        });
        const centroidX = sumX / size;
        const centroidY = sumY / size;

        if (size === 1) {
          store.getState().handlePointerMove(centroidX, centroidY);
        } else if (size === 2) {
          const pts = Array.from(activePointers.current.values());
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          
          if (!store.getState().options.twoFingerRotate) {
            if (touchStartDistance.current !== null && touchStartDistance.current > 0) {
              const deltaLog = Math.log(touchStartDistance.current / dist);
              store.getState().handleZoomDelta(deltaLog);
              touchStartDistance.current = dist;
            }
          }
          store.getState().handlePointerMove(centroidX, centroidY);
        } else if (size >= 3) {
          store.getState().handlePointerMove(centroidX, centroidY);
        }
      }
    },
    [store]
  );

  const handlePointerUpCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') {
        store.getState().handlePointerUp();
        flushPersist();
        return;
      }

      if (activePointers.current.has(e.pointerId)) {
        const sizeBefore = activePointers.current.size;
        const isCaptured = sizeBefore >= 2 || (e.target as HTMLElement).hasPointerCapture?.(e.pointerId);
        
        if (isCaptured) {
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
        }

        activePointers.current.delete(e.pointerId);
        
        try {
          if ((e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          }
        } catch (err) {}

        if (activePointers.current.size === 0) {
          store.getState().handlePointerUp();
          touchStartDistance.current = null;
        } else {
          resetPointersBase();
        }
        flushPersist();
      }
    },
    [store, flushPersist, resetPointersBase]
  );

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
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerUpCapture}
        onPointerLeave={handlePointerUpCapture}
        onPointerCancelCapture={handlePointerUpCapture}
        onWheelCapture={handleWheel}
        onContextMenuCapture={handleContextMenu}
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
