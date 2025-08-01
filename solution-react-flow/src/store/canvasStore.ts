import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Node } from '@/models/Node';
import { Edge } from '@/models/Edge';

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
      // 初始状态
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
      name: 'julia-canvas-flow-state', // localStorage key
      version: 1, // 版本号，便于未来兼容
    }
  )
); 