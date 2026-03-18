import {
  CanvasEdgeKind,
  CanvasNodeKind,
  type CanvasEdgeFlowData,
  type CanvasNodeFlowData,
} from '@/types/canvas';
import type { CanvasArchiveLegacy, CanvasArchiveState } from '@/types/persistence';
import { defaultViewport } from './to-v7';

const defaultHiddenSections = {
  inputs: false,
  outputs: false,
  logs: false,
  errors: false,
};

/**
 * v8 UI 节点 entry 结构（仅用于迁移链路内部）。
 */
export interface V8NodeEntry {
  id: string;
  type: string;
  data: any;
}

/**
 * v8 UI 边 entry 结构（仅用于迁移链路内部）。
 */
export interface V8EdgeEntry {
  id: string;
  source: string;
  target: string;
  type: string;
  data: any;
}

const normalizeUINodes = (nodes: any[]): V8NodeEntry[] =>
  nodes.map((node) => {
    if (node?.type === CanvasNodeKind.TextNode || node?.type === 'textNode') {
      return {
        id: String(node.id),
        type: CanvasNodeKind.TextNode,
        data: {
          code: typeof node?.data?.code === 'string' ? node.data.code : '',
          controls: Array.isArray(node?.data?.controls) ? node.data.controls : [],
          width: typeof node?.data?.width === 'number' ? node.data.width : undefined,
          height: typeof node?.data?.height === 'number' ? node.data.height : undefined,
          autoResizeWidth: node?.data?.autoResizeWidth ?? true,
          nodeName: typeof node?.data?.nodeName === 'string' ? node.data.nodeName : '',
          isCollapsed: node?.data?.isCollapsed ?? false,
          hiddenSections: node?.data?.hiddenSections ?? defaultHiddenSections,
        },
      };
    }

    return {
      id: String(node.id),
      type: CanvasNodeKind.DesmosPreviewNode,
      data: (node?.data ?? {}) as Record<string, unknown>,
    };
  });

const normalizeUIEdges = (edges: any[]): V8EdgeEntry[] =>
  edges
    .filter((edge) => edge?.id && edge?.source && edge?.target && edge?.type)
    .map((edge) => {
      if (edge.type === CanvasEdgeKind.DesmosPreviewEdge || edge.type === 'desmosPreviewEdge') {
        return {
          id: String(edge.id),
          source: String(edge.source),
          target: String(edge.target),
          type: CanvasEdgeKind.DesmosPreviewEdge,
          data: {
            sourceOutputName: String(edge?.data?.sourceOutputName ?? ''),
          },
        };
      }

      return {
        id: String(edge.id),
        source: String(edge.source),
        target: String(edge.target),
        type: CanvasEdgeKind.CustomEdge,
        data: (edge?.data ?? {}) as Record<string, unknown>,
      };
    });

const normalizeFlowNodes = (nodes: any[]): CanvasNodeFlowData[] =>
  nodes.map((node) => ({
    id: String(node.id),
    type: node?.type === CanvasNodeKind.DesmosPreviewNode || node?.type === 'desmosPreviewNode'
      ? CanvasNodeKind.DesmosPreviewNode
      : CanvasNodeKind.TextNode,
    position: node?.position ?? { x: 0, y: 0 },
    data: {},
  }));

const normalizeFlowEdges = (edges: any[]): CanvasEdgeFlowData[] =>
  edges
    .filter((edge) => edge?.id && edge?.source && edge?.target && edge?.type)
    .map((edge) => ({
      id: String(edge.id),
      source: String(edge.source),
      target: String(edge.target),
      type: edge.type === CanvasEdgeKind.DesmosPreviewEdge || edge.type === 'desmosPreviewEdge'
        ? CanvasEdgeKind.DesmosPreviewEdge
        : CanvasEdgeKind.CustomEdge,
      data: {},
    }));

/**
 * v7 版本迁移到 v8 版本
 */
export const v7ToV8 = (archive: CanvasArchiveLegacy): CanvasArchiveLegacy => {

  if (archive.version < 8) {
    const legacyNodes = Array.isArray(archive.state?.nodes) ? archive.state.nodes : [];
    const legacyEdges = Array.isArray(archive.state?.edges) ? archive.state.edges : [];

    archive.state = {
        uiData: {
          nodes: normalizeUINodes(legacyNodes),
          edges: normalizeUIEdges(legacyEdges),
        },
        flowData: {
          nodes: normalizeFlowNodes(legacyNodes),
          edges: normalizeFlowEdges(legacyEdges),
          viewport: archive.state?.viewport ?? defaultViewport,
      },
    };
    archive.version = 8;
  }

  return archive;
};

