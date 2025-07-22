import { create } from 'zustand';
import { Node } from '../models/Node';

interface NodeState {
  nodes: Node[];
  addNode: (node: Node) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  removeNode: (id: string) => void;
}

export const useNodeStore = create<NodeState>((set) => ({
  nodes: [],
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (id, updates) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, ...updates } : node
      ),
    })),
  removeNode: (id) =>
    set((state) => ({ nodes: state.nodes.filter((node) => node.id !== id) })),
}));