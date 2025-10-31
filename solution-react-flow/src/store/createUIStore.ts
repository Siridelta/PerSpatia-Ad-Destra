import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { produce } from 'immer';
import type { Viewport } from '@xyflow/react';
import type { ControlInfo } from '@/services/jsExecutor';
import type { CanvasNode, CanvasEdge, DesmosPreviewNodeType, TextNodeType } from '@/types/canvas';
import type { CanvasPersistedState } from './canvasPersistenceStore';

/**
 * UI Store 状态接口
 */
export interface UIStoreState {
  // 状态数据
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  controlsCache: Record<string, ControlInfo[]>;
  desmosPreviewLinks: Record<string, DesmosPreviewLink>;

  // 节点操作
  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  removeNode: (id: string) => void;
  createDesmosPreviewNode: (params: CreateDesmosPreviewParams) => void;
  updateDesmosPreviewState: (sourceNodeId: string, desmosState: any) => void;

  // 边操作
  addEdge: (edge: CanvasEdge) => void;
  updateEdge: (id: string, updates: Partial<CanvasEdge>) => void;
  removeEdge: (id: string) => void;

  // 批量操作
  setNodes: (nodes: CanvasNode[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  clearCanvas: () => void;

  // 画布操作
  resetToDefault: () => void;
  setViewport: (viewport: Viewport) => void;

  // 控件缓存操作
  setNodeControlsCache: (nodeId: string, controls?: ControlInfo[]) => void;
  setControlsCache: (cache: Record<string, ControlInfo[]>) => void;
}

interface DesmosPreviewLink {
  previewNodeId: string;
  outputName: string;
}

interface CreateDesmosPreviewParams {
  sourceNodeId: string;
  sourceOutputName: string;
  desmosState: any;
}

// 默认视角（React Flow 默认值）
const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

// 判断视角是否几乎相等，避免重复写入触发额外渲染
const VIEWPORT_EPSILON = 0.0001;
const isSameViewport = (a: Viewport, b: Viewport) => (
  Math.abs(a.x - b.x) < VIEWPORT_EPSILON &&
  Math.abs(a.y - b.y) < VIEWPORT_EPSILON &&
  Math.abs(a.zoom - b.zoom) < VIEWPORT_EPSILON
);

// 默认节点和边的数据
import defaultCanvas from '@/components/Canvas/defaultCanvas';

/**
 * 创建 UI Store 的工厂函数
 * 
 * 每个画布实例应该调用此函数创建一个独立的 store 实例。
 * 这样可以支持多个画布实例，每个实例拥有独立的 UI 状态。
 * 
 * @param initialState 可选的初始状态。如果不提供，则使用默认画布数据。
 * @returns 一个新的 Zustand Store 实例
 */
export const createUIStore = (initialState?: Partial<CanvasPersistedState>) => {
  // 确定初始状态
  const initialNodes = initialState?.nodes ?? defaultCanvas.nodes;
  const initialEdges = initialState?.edges ?? defaultCanvas.edges;
  const initialViewport = initialState?.viewport ?? defaultCanvas.viewport ?? defaultViewport;
  const initialControlsCache = initialState?.controlsCache ?? {};
  const initialDesmosPreviewLinks = initialState?.desmosPreviewLinks ?? {};

  return create<UIStoreState>()(
    immer((set) => ({
      // 初始状态
      nodes: initialNodes,
      edges: initialEdges,
      viewport: initialViewport,
      controlsCache: initialControlsCache,
      desmosPreviewLinks: initialDesmosPreviewLinks,

      // 节点操作
      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node]
        })),

      updateNode: (id, updates) =>
        set((state) => produce(state, (draft) => {
          const node = draft.nodes.find((node) => node.id === id);
          if (node) {
            node.data = { ...node.data, ...updates };
          }
        })),

      removeNode: (id) =>
        set((state) => {
          const { nodes, edges, desmosPreviewLinks } = state;
          const nextLinks: Record<string, DesmosPreviewLink> = { ...desmosPreviewLinks };

          const cleanedNodes = nodes.filter((node) => node.id !== id);
          const cleanedEdges = edges.filter((edge) => edge.source !== id && edge.target !== id);

          // 如果这是源节点，删除其预览节点及映射
          if (nextLinks[id]) {
            const previewId = nextLinks[id].previewNodeId;
            delete nextLinks[id];
            return {
              nodes: cleanedNodes.filter((node) => node.id !== previewId),
              edges: cleanedEdges.filter((edge) => edge.source !== previewId && edge.target !== previewId),
              desmosPreviewLinks: nextLinks,
            };
          }

          // 如果这是预览节点，找到对应源节点，移除映射
          const sourceEntry = Object.entries(nextLinks).find(([, link]) => link.previewNodeId === id);
          if (sourceEntry) {
            const [sourceId] = sourceEntry;
            delete nextLinks[sourceId];
          }

          return {
            nodes: cleanedNodes,
            edges: cleanedEdges,
            desmosPreviewLinks: nextLinks,
          };
        }),

      createDesmosPreviewNode: ({ sourceNodeId, sourceOutputName, desmosState }) =>
        set((state) => {
          if (state.desmosPreviewLinks[sourceNodeId]) {
            return state;
          }

          const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
          if (!sourceNode) {
            return state;
          }

          const clonedState = (() => {
            try {
              return desmosState && typeof structuredClone === 'function'
                ? structuredClone(desmosState)
                : JSON.parse(JSON.stringify(desmosState ?? {}));
            } catch {
              return desmosState ?? {};
            }
          })();

          const previewNodeId = `desmos-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const offsetX = 420;
          const offsetY = 60;
          const previewIndex = Object.keys(state.desmosPreviewLinks).length;
          const previewNode: DesmosPreviewNodeType = {
            id: previewNodeId,
            type: 'desmosPreviewNode',
            position: {
              x: sourceNode.position.x + offsetX,
              y: sourceNode.position.y + previewIndex * offsetY,
            },
            data: {
              sourceNodeId,
              sourceOutputName,
              desmosState: clonedState,
            },
          };

          const previewEdge: CanvasEdge = {
            id: `edge-${sourceNodeId}-desmos-${Date.now()}`,
            source: sourceNodeId,
            target: previewNodeId,
            type: 'custom',
          };

          return {
            nodes: [...state.nodes, previewNode],
            edges: [...state.edges, previewEdge],
            desmosPreviewLinks: {
              ...state.desmosPreviewLinks,
              [sourceNodeId]: {
                previewNodeId,
                outputName: sourceOutputName,
              },
            },
          };
        }),

      updateDesmosPreviewState: (sourceNodeId, desmosState) =>
        set((state) => {
          const link = state.desmosPreviewLinks[sourceNodeId];
          if (!link) {
            return state;
          }

          const previewNodeId = link.previewNodeId;
          const cloneState = (() => {
            try {
              return desmosState && typeof structuredClone === 'function'
                ? structuredClone(desmosState)
                : JSON.parse(JSON.stringify(desmosState ?? {}));
            } catch {
              return desmosState ?? {};
            }
          })();

          const updatedNodes = state.nodes.map((node) => {
            if (node.id !== previewNodeId) {
              return node;
            }
            return {
              ...node,
              data: {
                ...node.data,
                desmosState: cloneState,
              },
            };
          });

          return {
            ...state,
            nodes: updatedNodes,
          };
        }),

      // 边操作
      addEdge: (edge) =>
        set((state) => ({
          edges: [...state.edges, edge]
        })),

      updateEdge: (id, updates) =>
        set((state) => ({
          edges: state.edges.map((edge) =>
            edge.id === id ? { ...edge, ...updates } : edge
          ),
        })),

      removeEdge: (id) =>
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== id)
        })),

      // 批量操作
      setNodes: (nodes) => set((state) => {
        const validIds = new Set(nodes.map((node) => node.id));

        const nextCache: Record<string, ControlInfo[]> = {};
        Object.entries(state.controlsCache).forEach(([id, controls]) => {
          if (validIds.has(id)) {
            nextCache[id] = controls;
          }
        });

        const nextPreviewLinks: Record<string, DesmosPreviewLink> = {};
        Object.entries(state.desmosPreviewLinks).forEach(([sourceId, link]) => {
          if (validIds.has(sourceId) && validIds.has(link.previewNodeId)) {
            nextPreviewLinks[sourceId] = link;
          }
        });

        return {
          nodes,
          controlsCache: nextCache,
          desmosPreviewLinks: nextPreviewLinks,
        };
      }),
      setEdges: (edges) => set({ edges }),

      clearCanvas: () => set({
        nodes: [],
        edges: [],
        viewport: defaultViewport,
        controlsCache: {},
        desmosPreviewLinks: {},
      }),

      // 画布操作
      resetToDefault: () => set({
        nodes: defaultCanvas.nodes,
        edges: defaultCanvas.edges,
        viewport: defaultCanvas.viewport ?? defaultViewport,
        controlsCache: {},
        desmosPreviewLinks: {},
      }),

      // 视角同步
      setViewport: (viewport) =>
        set((state) => (
          isSameViewport(state.viewport, viewport)
            ? {}
            : { viewport }
        )),

      setNodeControlsCache: (nodeId, controls) =>
        set((state) => {
          const nextCache = { ...state.controlsCache };
          if (!controls || controls.length === 0) {
            delete nextCache[nodeId];
          } else {
            nextCache[nodeId] = controls;
          }
          return { controlsCache: nextCache };
        }),

      setControlsCache: (cache) => set({ controlsCache: cache }),
    }))
  );
};

