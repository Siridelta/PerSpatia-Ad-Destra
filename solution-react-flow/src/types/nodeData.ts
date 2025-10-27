/// <reference types="desmos" />

/**
 * 文本节点的数据结构，负责描述 TextNode 自身需要的业务状态。
 * - `code`：节点内的脚本文本
 * - `result` / `outputs` / `logs` 等字段用于展示执行结果
 * - `width` / `height` 等字段驱动画布内的 UI 表现
 */
export interface TextNodeData extends Record<string, unknown> {
  code: string;
  initialEditing?: boolean;
  result?: string;
  showControls?: boolean;
  consoleLogs?: string[];
  constants?: Record<string, unknown>;
  width?: number;
  height?: number;
  nodeName?: string;
  isCollapsed?: boolean;
  hiddenSections?: {
    inputs?: boolean;
    outputs?: boolean;
    logs?: boolean;
    errors?: boolean;
  };
}

/**
 * Desmos 预览节点需要维护的状态：
 * - 指向源节点及其输出名称，便于建立映射
 * - 记录最新的 Desmos 图形状态，用于持久化与回显
 */
export interface DesmosPreviewNodeData extends Record<string, unknown> {
  sourceNodeId: string;
  sourceOutputName: string;
  desmosState?: Desmos.GraphState;
}


