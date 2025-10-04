import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Viewport } from '@xyflow/react';
import { Node } from '@/models/Node';
import { Edge } from '@/models/Edge';

/**
 * 画布状态管理 Store
 * 
 * 使用 Zustand persist 中间件实现自动持久化：
 * - 每次状态变化时自动保存到 localStorage
 * - 页面加载时自动从 localStorage 恢复状态
 * - 支持版本控制和数据迁移
 */

// 默认视角（React Flow 默认值）
const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

// 判断视角是否几乎相等，避免重复写入触发额外渲染
const VIEWPORT_EPSILON = 0.0001;
const isSameViewport = (a: Viewport, b: Viewport) => (
  Math.abs(a.x - b.x) < VIEWPORT_EPSILON &&
  Math.abs(a.y - b.y) < VIEWPORT_EPSILON &&
  Math.abs(a.zoom - b.zoom) < VIEWPORT_EPSILON
);

interface CanvasState {
  // 状态数据
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;

  // 节点操作
  addNode: (node: Node) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  removeNode: (id: string) => void;

  // 边操作
  addEdge: (edge: Edge) => void;
  updateEdge: (id: string, updates: Partial<Edge>) => void;
  removeEdge: (id: string) => void;

  // 批量操作
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  clearCanvas: () => void;

  // 画布操作
  resetToDefault: () => void;
  setViewport: (viewport: Viewport) => void;
}

// 默认节点和边的数据
import defaultCanvas from '@/components/Canvas/defaultCanvas';

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set) => ({
      // 初始状态 - 这些会被 persist 中间件覆盖（如果 localStorage 中有数据）
      nodes: defaultCanvas.nodes,
      edges: defaultCanvas.edges,
      viewport: defaultCanvas.viewport ?? defaultViewport,

      // 节点操作
      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node]
        })),

      updateNode: (id, updates) =>
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, ...updates } : node
          ),
        })),

      removeNode: (id) =>
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== id),
          // 同时移除相关的边
          edges: state.edges.filter((edge) =>
            edge.source !== id && edge.target !== id
          ),
        })),

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
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      clearCanvas: () => set({ nodes: [], edges: [], viewport: defaultViewport }),

      // 画布操作
      resetToDefault: () => set({
        nodes: defaultCanvas.nodes,
        edges: defaultCanvas.edges,
        viewport: defaultCanvas.viewport ?? defaultViewport
      }),

      // 视角同步
      setViewport: (viewport) =>
        set((state) => (
          isSameViewport(state.viewport, viewport)
            ? {}
            : { viewport }
        )),
    }),
    {
      name: 'desmos-canvas-flow-state', // localStorage key
      version: 3, // 版本号，便于未来兼容
      migrate: (persistedState: any, version) => {
        if (!persistedState) {
          return {
            nodes: defaultCanvas.nodes,
            edges: defaultCanvas.edges,
            viewport: defaultCanvas.viewport ?? defaultViewport,
          };
        }

        let newState = persistedState;

        if (version < 2 || !persistedState.viewport) {
          newState = {
            ...newState,
            viewport: defaultViewport,
          };
        }
        
        if (version < 3) {
          newState = {
            ...newState,
            nodes: newState.nodes.map((node: Node) => ({
              ...node,
              data: {
                ...node.data,
                code: typeof node.data?.label === 'string' ? node.data.label : '',
              },
            })),
          };
        }

        return newState;
      },
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            return JSON.parse(str);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
); 