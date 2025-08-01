import { Node } from '@/models/Node';
import { Edge } from '@/models/Edge';

export const generateNodeId = (): string => {
  return `node_${Math.random().toString(36).substr(2, 9)}`;
};

export const generateEdgeId = (): string => {
  return `edge_${Math.random().toString(36).substr(2, 9)}`;
};

export const createNode = (type: string, position: { x: number; y: number }, label: string): Node => {
  return {
    id: generateNodeId(),
    type,
    position,
    data: { label },
  };
};

export const createEdge = (source: string, target: string, type: string = 'default'): Edge => {
  return {
    id: generateEdgeId(),
    source,
    target,
    type,
  };
};