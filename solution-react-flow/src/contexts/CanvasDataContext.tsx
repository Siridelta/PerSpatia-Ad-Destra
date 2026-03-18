import { createContext, ReactNode, useContext, useMemo, useCallback } from 'react';
import { CanvasDataApi } from '@/hooks/useCanvasData';
import type { CanvasNodeUIData, TextNodeUIData } from '@/types/canvas';

interface CanvasDataProviderProps {
  api: CanvasDataApi;
  children: ReactNode;
}

const CanvasDataContext = createContext<CanvasDataApi | null>(null);

export const CanvasDataProvider = ({ api, children }: CanvasDataProviderProps) => (
  <CanvasDataContext.Provider value={api}>{children}</CanvasDataContext.Provider>
);

export const useCanvasDataApi = () => {
  const context = useContext(CanvasDataContext);
  if (!context) {
    throw new Error('useCanvasDataApi must be used within CanvasDataProvider');
  }
  return context;
};

/**
 * 获取特定节点的 UI 数据
 * 
 * 这是 TextNode 组件与 UI 数据系统交互的推荐方式。
 * 它从对应的 Provider 获取 api，并使用 api.useUIData 来订阅特定节点的数据。
 */
export const useTextNodeData = (nodeId: string) => {
  const canvasDataApi = useCanvasDataApi();

  // 订阅节点的 UI 数据
  const node = canvasDataApi.readUI.useUIData((data) => {
    return data.nodes.get(nodeId);
  });

  // 更新节点数据的方法
  const updateNode = useCallback(
    (updates: Partial<TextNodeUIData>) => {
      canvasDataApi.writeUI.updateNode(nodeId, updates);
    },
    [canvasDataApi, nodeId]
  );

  // 更新节点的 control 值
  const updateNodeControlValues = useCallback(
    (values: Record<string, unknown>) => {
      canvasDataApi.writeUI.updateNodeControlValues(nodeId, values);
    },
    [canvasDataApi, nodeId]
  );

  return useMemo(
    () => {
      if (!node || node.type !== 'textNode') {
        return null;
      } else {
        return {
          node,
          // 节点的 UI 相关属性
          code: node.data.code,
          controls: node.data.controls,
          nodeName: node.data.nodeName,
          width: node.data.width,
          height: node.data.height,
          autoResizeWidth: node.data.autoResizeWidth,
          isCollapsed: node.data.isCollapsed,
          hiddenSections: node.data.hiddenSections,
          // 更新方法
          updateNode,
          updateNodeControlValues,
        };
      }
    },
    [node, updateNode, updateNodeControlValues]
  );
};

/**
 * 获取特定节点的 UI 数据
 * 
 * 这是下层组件（如 TextNode）与 UI 系统交互的推荐方式。
 * 它从对应的 Provider 获取 api，并使用 api.useUIData 来订阅特定节点的数据。
 */
export const useDesmosPreviewNodeData = (nodeId: string) => {
  const canvasDataApi = useCanvasDataApi();

  // 订阅节点的 UI 数据
  const node = canvasDataApi.readUI.useUIData((data) => {
    return data.nodes.get(nodeId);
  });

  // 更新节点数据的方法
  const updateNode = useCallback(
    (updates: Partial<CanvasNodeUIData>) => {
      canvasDataApi.writeUI.updateNode(nodeId, updates);
    },
    [canvasDataApi, nodeId]
  );

  // 更新节点的 control 值
  const updateNodeControlValues = useCallback(
    (values: Record<string, unknown>) => {
      canvasDataApi.writeUI.updateNodeControlValues(nodeId, values);
    },
    [canvasDataApi, nodeId]
  );

  return useMemo(
    () => ({
      node,
      // 节点的 UI 相关属性
      code: node?.type === 'textNode' ? node.data.code : undefined,
      controls: node?.type === 'textNode' ? node.data.controls : undefined,
      nodeName: node?.type === 'textNode' ? node.data.nodeName : undefined,
      width: node?.type === 'textNode' ? node.data.width : undefined,
      height: node?.type === 'textNode' ? node.data.height : undefined,
      isCollapsed: node?.type === 'textNode' ? (node.data.isCollapsed ?? false) : undefined,
      hiddenSections: node?.type === 'textNode' ? (node.data.hiddenSections ?? {
        inputs: false,
        outputs: false,
        logs: false,
        errors: false,
      }) : undefined,
      showControls: node?.type === 'textNode' ? (node.data.showControls ?? false) : undefined,
      // 更新方法
      updateNode,
      updateNodeControlValues,
    }),
    [node, updateNode, updateNodeControlValues]
  );
};