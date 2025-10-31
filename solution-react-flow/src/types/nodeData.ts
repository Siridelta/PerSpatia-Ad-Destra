/// <reference types="desmos" />

import { Control } from "@/services/jsExecutor";

/**
 * 文本节点的数据结构，负责描述 TextNode 自身需要的业务状态。
 * - `code`：节点内的脚本代码
 * - `controls`：节点内的控制器
 * - `width` / `height` 等字段驱动画布内的 UI 表现
 * - `nodeName`：节点名称
 * - `isCollapsed`：节点是否折叠
 * - `hiddenSections`：节点内的隐藏部分（哪些部分是隐藏的）
 */
export interface TextNodeData extends Record<string, unknown> {
  code: string;
  controls: Control[];
  width?: number;
  height?: number;
  autoResizeWidth: boolean;
  nodeName: string;
  isCollapsed: boolean;
  hiddenSections: {
    inputs: boolean;
    outputs: boolean;
    logs: boolean;
    errors: boolean;
  };
};

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

export interface DesmosPreviewLink {
  previewNodeId: string;
  outputName: string;
}


