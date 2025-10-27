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

export interface CustomEdgeData {
  label?: string;
  [key: string]: unknown;
}

/**
 * 画布上使用的自定义边类型。
 * - 默认类型固定为 'custom'
 * - 数据结构允许携带标签等附加信息
 */
export type CanvasEdge = Edge<CustomEdgeData, 'custom'>;


