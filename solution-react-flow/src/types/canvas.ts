import type { Node, Edge } from '@xyflow/react';

import type { TextNodeData, DesmosPreviewNodeData } from './nodeData';

/**
 * UIData 节点类型（业务层，不包含 React Flow 布局信息）
 */
export interface TextNodeType {
  id: string;
  type: 'textNode';
  data: TextNodeData;
}

export interface DesmosPreviewNodeType {
  id: string;
  type: 'desmosPreviewNode';
  data: DesmosPreviewNodeData;
}

export type CanvasNode = TextNodeType | DesmosPreviewNodeType;

/**
 * FlowData 节点类型（仅用于 React Flow 渲染与交互）
 */
export type FlowTextNode = Node<Record<string, never>, 'textNode'>;
export type FlowDesmosPreviewNode = Node<Record<string, never>, 'desmosPreviewNode'>;
export type FlowNode = FlowTextNode | FlowDesmosPreviewNode;

export interface CustomEdgeData extends Record<string, unknown> {
  label?: string;
  [key: string]: unknown;
}

export interface DesmosPreviewEdgeData extends Record<string, unknown> {
  sourceOutputName: string;
}

// 强制设定 type 字段为必选，项目代码须使用此 TypedEdge 类型，勿使用 type 字段可选的 react-flow Edge 类型。
export type TypedEdge<EdgeData extends Record<string, unknown>, EdgeType extends string> = Edge<EdgeData, EdgeType> & {
  type: EdgeType;
  data: EdgeData;
};

export type CustomCanvasEdge = TypedEdge<CustomEdgeData, 'custom'>;
export type DesmosPreviewEdge = TypedEdge<DesmosPreviewEdgeData, 'desmosPreviewEdge'>;

export type CanvasEdge = CustomCanvasEdge | DesmosPreviewEdge;

/**
 * FlowData 边类型（仅用于 React Flow 渲染与交互）
 * data 在 flow 层并非必需，所以保持可选。
 */
export type FlowCustomEdge = Edge<Record<string, unknown>, 'custom'> & {
  type: 'custom';
  data?: Record<string, unknown>;
};
export type FlowDesmosPreviewEdge = Edge<Record<string, unknown>, 'desmosPreviewEdge'> & {
  type: 'desmosPreviewEdge';
  data?: Record<string, unknown>;
};
export type FlowEdge = FlowCustomEdge | FlowDesmosPreviewEdge;


