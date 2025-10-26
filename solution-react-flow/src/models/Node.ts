import { Node as FlowNode } from '@xyflow/react';

export interface NodePosition {
  x: number;
  y: number;
}

export interface Node<Data extends Record<string, any> = Record<string, any>> {
  id: string;
  type?: string;
  position: NodePosition;
  data: Data;
  selected?: boolean; // 添加选中状态支持
}

// 确保 Node 是 FlowNode 的子类型
type _AssertFlowNode = Node extends FlowNode ? true : false;
const _assertFlowNode: _AssertFlowNode = true;

export type AnyNode = Node<Record<string, any>>;