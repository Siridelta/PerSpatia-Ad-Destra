import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

interface CanvasState {
  // 状态数据
  nodes: Node[];
  edges: Edge[];

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
}

// 默认节点和边的数据
import { defaultNodes, defaultEdges } from '@/components/Canvas/defaultGraph';

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set) => ({
      // 初始状态 - 这些会被 persist 中间件覆盖（如果 localStorage 中有数据）
      nodes: defaultNodes,
      edges: defaultEdges,

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

      clearCanvas: () => set({ nodes: [], edges: [] }),

      // 画布操作
      resetToDefault: () => set({
        nodes: defaultNodes,
        edges: defaultEdges
      }),
    }),
    {
      name: 'desmos-canvas-flow-state', // localStorage key
      version: 1, // 版本号，便于未来兼容
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