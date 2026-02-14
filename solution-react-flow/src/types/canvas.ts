import type { Node, Edge } from '@xyflow/react';

import type { TextNodeUIData, DesmosPreviewNodeUIData } from './nodeData';

// --- Node Data Types ---

export enum CanvasNodeKind {
  TextNode = 'textNode',
  DesmosPreviewNode = 'desmosPreviewNode',
}

/**
 * UIData 节点类型（业务层，不包含 React Flow 布局信息）
 * 暂时保留 id+data 结构，但 UIData 迁移至 Map 存储后不再需要，需直接退化为 xxxUIData 类型
 */
export interface TextNodeUIDataEntry {
  id: string;
  type: CanvasNodeKind.TextNode;
  data: TextNodeUIData;
}

export interface DesmosPreviewNodeUIDataEntry {
  id: string;
  type: CanvasNodeKind.DesmosPreviewNode;
  data: DesmosPreviewNodeUIData;
}

export type CanvasNodeUIDataEntry = TextNodeUIDataEntry | DesmosPreviewNodeUIDataEntry;

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

export interface CustomEdgeUIData extends Record<string, unknown> {
  label?: string;
  [key: string]: unknown;
}

export interface DesmosPreviewEdgeUIData extends Record<string, unknown> {
  sourceOutputName: string;
}

// 强制设定 type 字段为必选，项目代码须使用此 TypedEdge 类型，勿使用 type 字段可选的 react-flow Edge 类型。
export type TypedEdge<EdgeData extends Record<string, unknown>, EdgeType extends string> = Edge<EdgeData, EdgeType> & {
  type: EdgeType;
  data: EdgeData;
};

export type CustomEdgeUIDataEntry = TypedEdge<CustomEdgeUIData, CanvasEdgeKind.CustomEdge>;
export type DesmosPreviewEdgeUIDataEntry = TypedEdge<DesmosPreviewEdgeUIData, CanvasEdgeKind.DesmosPreviewEdge>;

export type CanvasEdgeUIDataEntry = CustomEdgeUIDataEntry | DesmosPreviewEdgeUIDataEntry;

/**
 * FlowData 边类型（仅用于 React Flow 渲染与交互）
 * data 在 flow 层并非必需，所以保持可选。
 */
export type CustomEdgeFlowData = Edge<{}, CanvasEdgeKind.CustomEdge>;
export type DesmosPreviewEdgeFlowData = Edge<{}, CanvasEdgeKind.DesmosPreviewEdge>;
export type CanvasEdgeFlowData = CustomEdgeFlowData | DesmosPreviewEdgeFlowData;


