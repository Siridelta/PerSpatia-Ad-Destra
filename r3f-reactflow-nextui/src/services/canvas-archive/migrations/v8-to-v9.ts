import {
  CanvasEdgeKind,
  CanvasNodeKind,
  type CanvasEdgeUIData,
  type CanvasNodeUIData,
} from '@/types/canvas';
import type { CanvasArchiveLegacy } from '@/types/persistence';
import type { V8EdgeEntry, V8NodeEntry } from './v7-to-v8';

interface V8CanvasStateLike {
  uiData?: {
    nodes?: V8NodeEntry[];
    edges?: V8EdgeEntry[];
  };
  flowData?: unknown;
}

const toNodeRecord = (nodes: V8NodeEntry[] = []): Record<string, CanvasNodeUIData> => {
  const record: Record<string, CanvasNodeUIData> = {};
  nodes.forEach((node) => {
    if (!node?.id) return;
    if (node.type === CanvasNodeKind.TextNode) {
      record[node.id] = {
        type: CanvasNodeKind.TextNode,
        data: node.data,
      };
      return;
    }
    record[node.id] = {
      type: CanvasNodeKind.DesmosPreviewNode,
      data: node.data,
    };
  });
  return record;
};

const toEdgeRecord = (edges: V8EdgeEntry[] = []): Record<string, CanvasEdgeUIData> => {
  const record: Record<string, CanvasEdgeUIData> = {};
  edges.forEach((edge) => {
    if (!edge?.id || !edge?.source || !edge?.target) return;
    if (edge.type === CanvasEdgeKind.DesmosPreviewEdge) {
      record[edge.id] = {
        source: edge.source,
        target: edge.target,
        type: CanvasEdgeKind.DesmosPreviewEdge,
        data: edge.data,
      };
      return;
    }
    record[edge.id] = {
      source: edge.source,
      target: edge.target,
      type: CanvasEdgeKind.CustomEdge,
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
  return archive;
};
