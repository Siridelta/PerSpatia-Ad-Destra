import { create } from 'zustand';
import type { CanvasNode, CanvasEdge } from '@/types/canvas';
import type { Viewport } from '@xyflow/react';
import type { ControlInfo } from '@/services/jsExecutor';

/**
 * 画布持久化状态接口
 */
export interface CanvasPersistedState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  controlsCache: Record<string, ControlInfo[]>;
  desmosPreviewLinks: Record<string, { previewNodeId: string; outputName: string }>;
}

/**
 * 画布持久化 Store
 * 
 * 全局单例 Store，负责与 localStorage 交互：
 * - 保存画布状态到 localStorage
 * - 从 localStorage 加载画布状态
 * - 支持版本控制和数据迁移
 * 
 * 注意：此 Store 不管理 UI 状态，只负责持久化逻辑
 */
interface CanvasPersistenceState {
  saveState: (state: CanvasPersistedState) => void;
  loadState: () => CanvasPersistedState | null;
  clearState: () => void;
}

const STORAGE_KEY = 'desmos-canvas-flow-state';
const STORAGE_VERSION = 5;

// 默认视角（React Flow 默认值）
const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

// 数据迁移函数（从旧版本迁移到新版本）
const migrateState = (persistedState: any, version: number): CanvasPersistedState => {
  if (!persistedState) {
    return {
      nodes: [],
      edges: [],
      viewport: defaultViewport,
      controlsCache: {},
      desmosPreviewLinks: {},
    };
  }

  let newState = persistedState;

  // 版本 2: 添加 viewport
  if (version < 2 || !persistedState.viewport) {
    newState = {
      ...newState,
      viewport: defaultViewport,
    };
  }

  // 版本 3: 迁移 code 字段（从 label 迁移到 code）
  if (version < 3) {
    newState = {
      ...newState,
      nodes: newState.nodes.map((node: any) => ({
        ...node,
        data: {
          ...node.data,
          code: typeof node.data?.label === 'string' ? node.data.label : '',
        },
      })),
    };
  }

  // 版本 4: 添加 controlsCache
  if (version < 4 || !newState.controlsCache) {
    newState = {
      ...newState,
      controlsCache: {},
    };
  }

  // 版本 5: 添加 desmosPreviewLinks
  if (version < 5 || !newState.desmosPreviewLinks) {
    newState = {
      ...newState,
      desmosPreviewLinks: {},
    };
  }

  return newState;
};

export const useCanvasPersistenceStore = create<CanvasPersistenceState>()(() => ({
  /**
   * 保存画布状态到 localStorage
   */
  saveState: (state: CanvasPersistedState) => {
    try {
      const dataToSave = {
        state,
        version: STORAGE_VERSION,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('保存画布状态失败:', error);
    }
  },

  /**
   * 从 localStorage 加载画布状态
   */
  loadState: (): CanvasPersistedState | null => {
    try {
      const str = localStorage.getItem(STORAGE_KEY);
      if (!str) return null;

      const parsed = JSON.parse(str);
      
      // 检查版本并进行迁移
      const version = parsed.version || 0;
      const migratedState = migrateState(parsed.state || parsed, version);

      return migratedState;
    } catch (error) {
      console.error('加载画布状态失败:', error);
      return null;
    }
  },

  /**
   * 清除 localStorage 中的画布状态
   */
  clearState: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('清除画布状态失败:', error);
    }
  },
}));

