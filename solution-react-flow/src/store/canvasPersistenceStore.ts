import { create } from 'zustand';
import { type CanvasNodeUIDataEntry, type CanvasEdgeUIDataEntry, type CanvasNodeFlowData, type CanvasEdgeFlowData, CanvasNodeKind, CanvasEdgeKind } from '@/types/canvas';
import type { Viewport } from '@xyflow/react';
import type { Control } from '@/services/jsExecutor';

/**
 * 画布持久化状态接口
 */
export interface CanvasPersistedState {
  uiData: {
    nodes: CanvasNodeUIDataEntry[];
    edges: CanvasEdgeUIDataEntry[];
  };
  flowData: {
    nodes: CanvasNodeFlowData[];
    edges: CanvasEdgeFlowData[];
    viewport: Viewport;
  };
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
const STORAGE_VERSION = 8; // 版本 8: 拆分为 uiData + flowData

// 默认视角（React Flow 默认值）
const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

// 旧结构（混合存储）迁移到最新混合结构，用于后续拆分
const migrateLegacyMixedState = (persistedState: any, version: number) => {
  if (!persistedState) {
    return {
      nodes: [],
      edges: [],
      viewport: defaultViewport,
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

  // 版本 6: 将 controlsCache 迁移到节点数据中; 固定 autoResizeWidth, nodeName, isCollapsed, hiddenSections
  if (version < 6 && newState.controlsCache) {
    newState = {
      ...newState,
      nodes: newState.nodes.map((node: any) => {
        if (node.type === 'textNode') {
          const controls = newState.controlsCache?.[node.id] ?? [];
          return {
            ...node,
            data: {
              ...node.data,
              controls: controls,
              autoResizeWidth: node.data.autoResizeWidth ?? true,
              nodeName: node.data.nodeName ?? '',
              isCollapsed: node.data.isCollapsed ?? false,
              hiddenSections: node.data.hiddenSections ?? {
                inputs: false,
                outputs: false,
                logs: false,
                errors: false,
              },
            },
          };
        }
        return node;
      }),
      // 移除 controlsCache，因为已经整合到节点数据中
      controlsCache: undefined,
    };
  }

  // 版本 7: 使用专用边存储预览节点关系，并移除旧字段
  if (version < 7) {
    const legacyLinks = newState.desmosPreviewLinks ?? {};
    if (Array.isArray(newState.edges) && legacyLinks && Object.keys(legacyLinks).length > 0) {
      newState = {
        ...newState,
        edges: newState.edges.map((edge: any) => {
          const link = legacyLinks[edge.source];
          if (link && edge.target === link.previewNodeId) {
            return {
              ...edge,
              type: 'desmosPreviewEdge',
              data: {
                ...(edge.data ?? {}),
                sourceOutputName: link.outputName,
              },
            };
          }
          return edge;
        }),
      };
    }

    if (Array.isArray(newState.nodes)) {
      newState = {
        ...newState,
        nodes: newState.nodes.map((node: any) => {
          if (node.type === 'desmosPreviewNode') {
            const { desmosState: _legacyState, sourceNodeId: _legacySource, sourceOutputName: _legacyOutput, ...restData } = node.data ?? {};
            return {
              ...node,
              data: restData,
            };
          }
          return node;
        })
      };
    }

    const { desmosPreviewLinks: _legacyLinks, ...rest } = newState;
    newState = rest;
  }

  return newState;
};

const defaultHiddenSections = {
  inputs: false,
  outputs: false,
  logs: false,
  errors: false,
};

const normalizeUINodes = (nodes: any[]): CanvasNodeUIDataEntry[] =>
  nodes.map((node) => {
    if (node?.type === 'textNode') {
      return {
        id: String(node.id),
        type: CanvasNodeKind.TextNode,
        data: {
          code: typeof node?.data?.code === 'string' ? node.data.code : '',
          controls: Array.isArray(node?.data?.controls) ? node.data.controls : [],
          width: typeof node?.data?.width === 'number' ? node.data.width : undefined,
          height: typeof node?.data?.height === 'number' ? node.data.height : undefined,
          autoResizeWidth: node?.data?.autoResizeWidth ?? true,
          nodeName: typeof node?.data?.nodeName === 'string' ? node.data.nodeName : '',
          isCollapsed: node?.data?.isCollapsed ?? false,
          hiddenSections: node?.data?.hiddenSections ?? defaultHiddenSections,
        },
      };
    }

    return {
      id: String(node.id),
      type: CanvasNodeKind.DesmosPreviewNode,
      data: (node?.data ?? {}) as Record<string, unknown>,
    };
  });

const normalizeUIEdges = (edges: any[]): CanvasEdgeUIDataEntry[] =>
  edges
    .filter((edge) => edge?.id && edge?.source && edge?.target && edge?.type)
    .map((edge) => {
      if (edge.type === CanvasEdgeKind.DesmosPreviewEdge) {
        return {
          id: String(edge.id),
          source: String(edge.source),
          target: String(edge.target),
          type: CanvasEdgeKind.DesmosPreviewEdge,
          data: {
            sourceOutputName: String(edge?.data?.sourceOutputName ?? ''),
          },
        };
      }

      return {
        id: String(edge.id),
        source: String(edge.source),
        target: String(edge.target),
        type: CanvasEdgeKind.CustomEdge,
        data: (edge?.data ?? {}) as Record<string, unknown>,
      };
    });

const normalizeFlowNodes = (nodes: any[]): CanvasNodeFlowData[] =>
  nodes.map((node) => ({
    id: String(node.id),
    type: node?.type === CanvasNodeKind.DesmosPreviewNode ? CanvasNodeKind.DesmosPreviewNode : CanvasNodeKind.TextNode,
    position: node?.position ?? { x: 0, y: 0 },
    data: {},
  }));

const normalizeFlowEdges = (edges: any[]): CanvasEdgeFlowData[] =>
  edges
    .filter((edge) => edge?.id && edge?.source && edge?.target && edge?.type)
    .map((edge) => ({
      id: String(edge.id),
      source: String(edge.source),
      target: String(edge.target),
      type: edge.type === CanvasEdgeKind.DesmosPreviewEdge ? CanvasEdgeKind.DesmosPreviewEdge : CanvasEdgeKind.CustomEdge,
      data: {},
    }));

// 数据迁移函数（从旧版本迁移到新版本）
const migrateState = (persistedState: any, version: number): CanvasPersistedState => {
  // 新结构：直接兜底修正
  if (persistedState?.uiData || persistedState?.flowData) {
    const uiNodesRaw = Array.isArray(persistedState?.uiData?.nodes) ? persistedState.uiData.nodes : [];
    const uiEdgesRaw = Array.isArray(persistedState?.uiData?.edges) ? persistedState.uiData.edges : [];
    const flowNodesRaw = Array.isArray(persistedState?.flowData?.nodes) ? persistedState.flowData.nodes : [];
    const flowEdgesRaw = Array.isArray(persistedState?.flowData?.edges) ? persistedState.flowData.edges : [];

    return {
      uiData: {
        nodes: normalizeUINodes(uiNodesRaw),
        edges: normalizeUIEdges(uiEdgesRaw),
      },
      flowData: {
        nodes: normalizeFlowNodes(flowNodesRaw),
        edges: normalizeFlowEdges(flowEdgesRaw),
        viewport: persistedState?.flowData?.viewport ?? defaultViewport,
      },
    };
  }

  // 旧结构：先迁移到最新混合结构，再拆分
  const legacy = migrateLegacyMixedState(persistedState, version);
  const legacyNodes = Array.isArray(legacy?.nodes) ? legacy.nodes : [];
  const legacyEdges = Array.isArray(legacy?.edges) ? legacy.edges : [];

  return {
    uiData: {
      nodes: normalizeUINodes(legacyNodes),
      edges: normalizeUIEdges(legacyEdges),
    },
    flowData: {
      nodes: normalizeFlowNodes(legacyNodes),
      edges: normalizeFlowEdges(legacyEdges),
      viewport: legacy?.viewport ?? defaultViewport,
    },
  };
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

