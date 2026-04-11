import {
  CanvasEdgeKind,
  CanvasNodeFlowData,
  CanvasNodeKind,
  CanvasEdgeFlowData,
  type CanvasEdgeUIData,
  type CanvasNodeUIData,
} from '@/types/canvas';
import type { CanvasArchiveLegacy } from '@/types/persistence';
import type { V8CanvasStateLike, V8EdgeEntry, V8NodeEntry } from './v7-to-v8';
import type { Viewport } from '@xyflow/react';

export interface V9CanvasNodeUIData {
  type: string;
  data: any;
}

export interface V9CanvasEdgeUIData {
  source: string;
  target: string;
  type: string;
  data: any;
}

export interface V9CanvasNodeFlowData {
  id: string;
  type: string;
  data: any;
  position: {
    x: number;
    y: number;
  };
}
export interface V9CanvasEdgeFlowData {
  id: string;
  source: string;
  target: string;
  type: string;
  data: any;
}
export interface V9Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface V9CanvasStateLike {
  uiData: {
    nodes: Record<string, V9CanvasNodeUIData>;
    edges: Record<string, V9CanvasEdgeUIData>;
  };
  flowData: {
    nodes: V9CanvasNodeFlowData[];
    edges: V9CanvasEdgeFlowData[];
    viewport: V9Viewport;
  };
}

const toNodeRecord = (nodes: V8NodeEntry[] = []): Record<string, V9CanvasNodeUIData> => {
  const record: Record<string, V9CanvasNodeUIData> = {};
  nodes.forEach((node) => {
    if (!node?.id) return;
    if (node.type === 'textNode') {
      record[node.id] = {
        type: 'textNode',
        data: node.data,
      };
      return;
    }
    record[node.id] = {
      type: 'desmosPreviewNode',
      data: node.data,
    };
  });
  return record;
};

const toEdgeRecord = (edges: V8EdgeEntry[] = []): Record<string, V9CanvasEdgeUIData> => {
  const record: Record<string, V9CanvasEdgeUIData> = {};
  edges.forEach((edge) => {
    if (!edge?.id || !edge?.source || !edge?.target) return;
    if (edge.type === 'desmosPreviewEdge') {
      record[edge.id] = {
        source: edge.source,
        target: edge.target,
        type: 'desmosPreviewEdge',
        data: edge.data,
      };
      return;
    }
    record[edge.id] = {
      source: edge.source,
      target: edge.target,
      type: 'customEdge',
      data: edge.data,
    };
  });
  return record;
};

/**
 * v8 -> v9:
 * - uiData.nodes: legacy array-entry -> Record<string, CanvasNodeUIData>
 * - uiData.edges: legacy array-entry -> Record<string, CanvasEdgeUIData>
 */
export const v8ToV9 = (archive: CanvasArchiveLegacy): CanvasArchiveLegacy => {
  if (archive.version >= 9) return archive;

  const state = (archive.state ?? {}) as V8CanvasStateLike;
  const uiNodes = Array.isArray(state.uiData?.nodes) ? state.uiData!.nodes : [];
  const uiEdges = Array.isArray(state.uiData?.edges) ? state.uiData!.edges : [];

  archive.state = {
    ...state,
    uiData: {
      nodes: toNodeRecord(uiNodes),
      edges: toEdgeRecord(uiEdges),
    },
  };
  archive.version = 9;
  archive.state satisfies V9CanvasStateLike;
  return archive;
};
