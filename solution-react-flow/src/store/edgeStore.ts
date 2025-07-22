import { create } from 'zustand';
import { Edge } from '../models/Edge';

interface EdgeState {
  edges: Edge[];
  addEdge: (edge: Edge) => void;
  updateEdge: (id: string, updates: Partial<Edge>) => void;
  removeEdge: (id: string) => void;
}

export const useEdgeStore = create<EdgeState>((set) => ({
  edges: [],
  addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),
  updateEdge: (id, updates) =>
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === id ? { ...edge, ...updates } : edge
      ),
    })),
  removeEdge: (id) =>
    set((state) => ({ edges: state.edges.filter((edge) => edge.id !== id) })),
}));