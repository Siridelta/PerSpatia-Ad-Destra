import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createUIStore, UIStoreState } from '@/store/createUIStore';
import { useCanvasPersistenceStore } from '@/store/canvasPersistenceStore';
import type { StoreApi } from 'zustand';

/**
 * UI Store 上下文类型
 */
type UIStore = ReturnType<typeof createUIStore>;

const UIStoreContext = createContext<UIStore | null>(null);

/**
 * UI Store Provider 组件
 * 
 * 这是一个临时的过渡组件，用于平滑迁移：
 * - 在内部创建并持有一个 uiStore 实例
 * - 首次挂载时，从 canvasPersistenceStore 加载数据来初始化 uiStore
 * - 使用 uiStore.subscribe() 监听变化，并在每次变化后调用 canvasPersistenceStore 的 saveState 方法
 * - 通过 React Context 将 uiStore 实例提供出去
 */
export const UIStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {loadState, saveState} = useCanvasPersistenceStore();
  const [store] = useState(() => createUIStore(loadState() || undefined));

  // 使用 ref 来追踪是否已经初始化完成，避免首次加载时重复保存
  const isInitializedRef = useRef(false);

  // 监听 store 变化并保存到持久化存储
  useEffect(() => {
    // 标记初始化完成
    isInitializedRef.current = true;

    // 订阅 store 变化
    const unsubscribe = store.subscribe((state) => {
      // 如果还未初始化完成，跳过保存（避免首次加载时重复保存）
      if (!isInitializedRef.current) return;

      // 构建要保存的状态
      const stateToSave = {
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        controlsCache: state.controlsCache,
        desmosPreviewLinks: state.desmosPreviewLinks,
      };

      // 保存到持久化存储
      saveState(stateToSave);
    });

    return unsubscribe;
  }, [store, saveState]);

  // 标记初始化完成（在首次渲染后）
  useEffect(() => {
    // 使用 requestAnimationFrame 确保在首次渲染后执行
    requestAnimationFrame(() => {
      isInitializedRef.current = true;
    });
  }, []);

  return (
    <UIStoreContext.Provider value={store}>
      {children}
    </UIStoreContext.Provider>
  );
};

/**
 * 选择性订阅 UI Store 数据的 Hook
 * 
 * 必须在 UIStoreProvider 内部使用
 */
export const useUIStore = <T,>(selector: (state: UIStoreState) => T): T => {
  const store = useContext(UIStoreContext);
  if (!store) {
    throw new Error('useUIStore must be used within UIStoreProvider');
  }
  return useStore(store, selector);
};

/**
 * 获取 UI Store 实例的 Hook
 * 
 * 必须在 UIStoreProvider 内部使用
 */
export const useGetUIStore = (): UIStore => {
  const store = useContext(UIStoreContext);
  if (!store) {
    throw new Error('useGetUIStore must be used within UIStoreProvider');
  }
  return store;
};

