import type { Node, Edge } from '@xyflow/react';

import type {
  TextNodeUIData as TextNodePayloadFromNodeData,
  DesmosPreviewNodeUIData as DesmosPreviewNodePayloadFromNodeData,
} from './nodeData';

// --- Node Data Types ---

export enum CanvasNodeKind {
  TextNode = 'textNode',
  DesmosPreviewNode = 'desmosPreviewNode',
}

/**
 * Node payload：仅表示 node.data 的业务字段。
 */
export type TextNodePayload = TextNodePayloadFromNodeData;
export type DesmosPreviewNodePayload = DesmosPreviewNodePayloadFromNodeData;

/**
 * UIData 节点类型（业务层，不包含 React Flow 布局信息）
 * 运行态（Map value）不再携带 id，id 由 Map key 提供。
 */
export interface TextNodeUIData {
  type: CanvasNodeKind.TextNode;
  data: TextNodePayload;
}

export interface DesmosPreviewNodeUIData {
  type: CanvasNodeKind.DesmosPreviewNode;
  data: DesmosPreviewNodePayload;
}

export type CanvasNodeUIData = TextNodeUIData | DesmosPreviewNodeUIData;

/**
 * FlowData 节点类型（仅用于 React Flow 渲染与交互）
 */
export type TextNodeFlowData = Node<{}, CanvasNodeKind.TextNode>;
export type DesmosPreviewNodeFlowData = Node<{}, CanvasNodeKind.DesmosPreviewNode>;
export type CanvasNodeFlowData = TextNodeFlowData | DesmosPreviewNodeFlowData;



// --- Edge Data Types ---

export enum CanvasEdgeKind {
  CustomEdge = 'custom',
  DesmosPreviewEdge = 'desmosPreviewEdge',
}

/**
 * Edge payload：仅表示 edge.data 的业务字段。
 */
export interface CustomEdgePayload extends Record<string, unknown> {
  label?: string;
  [key: string]: unknown;
}

export interface DesmosPreviewEdgePayload extends Record<string, unknown> {
  sourceOutputName: string;
}

/**
 * 运行态 Edge（Map value）不再携带 id，id 由 Map key 提供。
 */
export interface CustomEdgeUIData {
  source: string;
  target: string;
  type: CanvasEdgeKind.CustomEdge;
  data: CustomEdgePayload;
}

export interface DesmosPreviewEdgeUIData {
  source: string;
  target: string;
  type: CanvasEdgeKind.DesmosPreviewEdge;
  data: DesmosPreviewEdgePayload;
}

export type CanvasEdgeUIData = CustomEdgeUIData | DesmosPreviewEdgeUIData;

/**
 * FlowData 边类型（仅用于 React Flow 渲染与交互）
 * data 在 flow 层并非必需，所以保持可选。
 */
export type CustomEdgeFlowData = Edge<{}, CanvasEdgeKind.CustomEdge>;
export type DesmosPreviewEdgeFlowData = Edge<{}, CanvasEdgeKind.DesmosPreviewEdge>;
export type CanvasEdgeFlowData = CustomEdgeFlowData | DesmosPreviewEdgeFlowData;


