import type { Node, Edge } from '@xyflow/react';

import type { TextNodeData, DesmosPreviewNodeData } from './nodeData';

/**
 * 画布上可能出现的节点类型合集。
 * - TextCanvasNode：主文本节点，承载代码编辑器。
 * - DesmosPreviewCanvasNode：Desmos 预览节点，与文本节点输出联动。
 */
export type TextNodeType = Node<TextNodeData, 'textNode'>;
export type DesmosPreviewNodeType = Node<DesmosPreviewNodeData, 'desmosPreviewNode'>;

export type CanvasNode = TextNodeType | DesmosPreviewNodeType;

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


