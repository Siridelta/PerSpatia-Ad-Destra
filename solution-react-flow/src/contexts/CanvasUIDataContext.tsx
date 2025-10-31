import { createContext, ReactNode, useContext, useMemo, useCallback } from 'react';
import { CanvasUIDataApi } from '@/hooks/useCanvasUIData';
import type { CanvasNode, TextNodeType } from '@/types/canvas';

interface CanvasUIDataProviderProps {
  api: CanvasUIDataApi;
  children: ReactNode;
}

const CanvasUIDataContext = createContext<CanvasUIDataApi | null>(null);

export const CanvasUIDataProvider = ({ api, children }: CanvasUIDataProviderProps) => (
  <CanvasUIDataContext.Provider value={api}>{children}</CanvasUIDataContext.Provider>
);

export const useCanvasUIDataApi = () => {
  const context = useContext(CanvasUIDataContext);
  if (!context) {
    throw new Error('useCanvasUIDataApi must be used within CanvasUIDataProvider');
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
  const uiDataApi = useCanvasUIDataApi();

  // 订阅节点的 UI 数据
  const node = uiDataApi.useUIData((data) => {
    return data.nodes.find((n) => n.id === nodeId);
  });

  // 更新节点数据的方法
  const updateNode = useCallback(
    (updates: Partial<TextNodeType>) => {
      uiDataApi.updateNode(nodeId, updates);
    },
    [uiDataApi, nodeId]
  );

  // 更新节点的 control 值
  const updateNodeControlValues = useCallback(
    (values: Record<string, unknown>) => {
      uiDataApi.updateNodeControlValues(nodeId, values);
    },
    [uiDataApi, nodeId]
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
  const uiDataApi = useCanvasUIDataApi();

  // 订阅节点的 UI 数据
  const node = uiDataApi.useUIData((data) => {
    return data.nodes.find((n) => n.id === nodeId);
  });

  // 更新节点数据的方法
  const updateNode = useCallback(
    (updates: Partial<CanvasNode>) => {
      uiDataApi.updateNode(nodeId, updates);
    },
    [uiDataApi, nodeId]
  );

  // 更新节点的 control 值
  const updateNodeControlValues = useCallback(
    (values: Record<string, unknown>) => {
      uiDataApi.updateNodeControlValues(nodeId, values);
    },
    [uiDataApi, nodeId]
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