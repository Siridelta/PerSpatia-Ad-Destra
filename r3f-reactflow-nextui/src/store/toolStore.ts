import { create } from 'zustand';

export type ToolType = 'select' | 'text' | 'connect';

interface ToolStore {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  
  // 连接状态
  connectionStartNode: string | null;
  setConnectionStartNode: (nodeId: string | null) => void;
}

export const useToolStore = create<ToolStore>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  
  connectionStartNode: null,
  setConnectionStartNode: (nodeId) => set({ connectionStartNode: nodeId }),
})); 