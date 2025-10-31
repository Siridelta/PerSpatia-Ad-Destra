import { useEffect, useMemo, useRef, useState } from 'react';
import { create, useStore } from 'zustand';
import { CanvasPersistedState, useCanvasPersistenceStore } from '@/store/canvasPersistenceStore';
import { CanvasEvalApi } from './useCanvasEval';
import type { CanvasNode, CanvasEdge, TextNodeType, DesmosPreviewNodeType, DesmosPreviewLink } from '@/types/canvas';
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type Viewport } from '@xyflow/react';
import type { NodeControls } from '@/services/jsExecutor';
import { DesmosPreviewNodeData, TextNodeData } from '@/types/nodeData';


export interface UIStoreState {
  // 状态数据
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  desmosPreviewLinks: Record<string, DesmosPreviewLink>;
}

/**
 * UI 数据接口
 * 提供给外部订阅的统一数据结构
 */
export interface UIData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  desmosPreviewLinks: Record<string, DesmosPreviewLink>;
}

/**
 * UI Data API 接口
 * 封装 UI 状态管理的所有操作
 */
export interface CanvasUIDataApi {
  // 订阅方法
  subscribeFromEval: (evalApi: CanvasEvalApi) => () => void;
  subscribeData: (callback: (data: UIData, prevData?: UIData) => void) => () => void;

  // 数据访问方法
  getSnapshot: () => UIData;
  useUIData: <T>(selector: (data: UIData) => T) => T;
  useNodeData: (id: string) => TextNodeData | DesmosPreviewNodeData | undefined;

  // 节点操作
  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, updates: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  setNodes: (nodes: CanvasNode[]) => void;

  // 边操作
  addEdge: (edge: CanvasEdge) => void;
  updateEdge: (id: string, updates: Partial<CanvasEdge>) => void;
  removeEdge: (id: string) => void;
  setEdges: (edges: CanvasEdge[]) => void;

  // 画布操作
  setViewport: (viewport: Viewport) => void;
  clearCanvas: () => void;
  resetToDefault: () => void;

  // 导入/导出操作
  importCanvasData: (data: { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport?: Viewport }) => void;
  exportCanvasData: () => { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: Viewport };

  // React Flow 集成
  handleNodesChange: (changes: NodeChange[]) => void;
  handleEdgesChange: (changes: EdgeChange[]) => void;

  // 便捷创建操作
  createEdge: (source: string, target: string, edgeData?: Partial<CanvasEdge>) => CanvasEdge;

  // TextNode 操作
  defaultTextNodeData: TextNodeData;
  createTextNode: (node: Partial<TextNodeType>) => void;

  // Desmos 预览节点操作
  createDesmosPreviewNode: (params: { sourceNodeId: string; sourceOutputName: string; desmosState: any }) => void;
  updateDesmosPreviewState: (sourceNodeId: string, desmosState: any) => void;

  // Controls 操作
  updateNodeControlValues: (nodeId: string, values: Record<string, unknown>) => void;
  updateNodeControlValue: (nodeId: string, controlName: string, value: unknown) => void;
}



// 默认节点和边的数据
import defaultCanvas from '@/components/Canvas/defaultCanvas';
import { immer } from 'zustand/middleware/immer';

// 默认视角（React Flow 默认值）
const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

// 判断视角是否几乎相等，避免重复写入触发额外渲染
const VIEWPORT_EPSILON = 0.0001;
const isSameViewport = (a: Viewport, b: Viewport) => (
  Math.abs(a.x - b.x) < VIEWPORT_EPSILON &&
  Math.abs(a.y - b.y) < VIEWPORT_EPSILON &&
  Math.abs(a.zoom - b.zoom) < VIEWPORT_EPSILON
);

/**
 * 创建 UI Store 的工厂函数
 * 
 * 每个画布实例应该调用此函数创建一个独立的 store 实例。
 * 这样可以支持多个画布实例，每个实例拥有独立的 UI 状态。
 * 
 * @param initialState 可选的初始状态。如果不提供，则使用默认画布数据。
 * @returns 一个新的 Zustand Store 实例
 */
const createUIStore = (initialState?: Partial<CanvasPersistedState>) => {
  // 确定初始状态
  const initialNodes = initialState?.nodes ?? defaultCanvas.nodes;
  const initialEdges = initialState?.edges ?? defaultCanvas.edges;
  const initialViewport = initialState?.viewport ?? defaultCanvas.viewport ?? defaultViewport;
  const initialDesmosPreviewLinks = initialState?.desmosPreviewLinks ?? {};

  return create<UIStoreState>()(
    immer(() => ({
      // 初始状态
      nodes: initialNodes,
      edges: initialEdges,
      viewport: initialViewport,
      desmosPreviewLinks: initialDesmosPreviewLinks,
    }))
  );
};



/**
 * 将 UIStoreState 转换为 UIData
 */
const toUIData = (state: UIStoreState): UIData => ({
  nodes: state.nodes,
  edges: state.edges,
  viewport: state.viewport,
  desmosPreviewLinks: state.desmosPreviewLinks,
});

/**
 * 计算 EvalData 变化的增量
 */
interface EvalDataDelta {
  updatedControls: Record<string, NodeControls[]>;
  hasChanges: boolean;
}

const resolveEvalDataDelta = (
  currentEvalData: Record<string, { controls: NodeControls[] }>,
  prevEvalData?: Record<string, { controls: NodeControls[] }>
): EvalDataDelta => {
  if (!prevEvalData) {
    // 首次初始化，所有 controls 都是新的
    const updatedControls: Record<string, NodeControls[]> = {};
    Object.entries(currentEvalData).forEach(([nodeId, nodeData]) => {
      if (nodeData.controls.length > 0) {
        updatedControls[nodeId] = nodeData.controls;
      }
    });
    return {
      updatedControls,
      hasChanges: Object.keys(updatedControls).length > 0,
    };
  }

  const updatedControls: Record<string, NodeControls[]> = {};

  // 检查每个节点的 controls 是否有变化
  Object.entries(currentEvalData).forEach(([nodeId, nodeData]) => {
    const prevControls = prevEvalData[nodeId]?.controls || [];
    const currentControls = nodeData.controls || [];

    // 简单比较：如果长度不同或内容不同，则认为有变化
    if (prevControls.length !== currentControls.length) {
      updatedControls[nodeId] = currentControls;
    } else {
      // 深度比较 controls 的定义（不包括 value）
      const hasDefinitionChange = prevControls.some((prev, index) => {
        const curr = currentControls[index];
        return (
          !curr ||
          prev.name !== curr.name ||
          prev.type !== curr.type ||
          prev.defaultValue !== curr.defaultValue
        );
      });

      if (hasDefinitionChange) {
        updatedControls[nodeId] = currentControls;
      }
    }
  });

  // 检查是否有节点被删除
  Object.keys(prevEvalData).forEach((nodeId) => {
    if (!currentEvalData[nodeId]) {
      updatedControls[nodeId] = [];
    }
  });

  return {
    updatedControls,
    hasChanges: Object.keys(updatedControls).length > 0,
  };
};

/**
 * Canvas UI Data Hook
 * 
 * 创建并管理 UI Store 实例，提供统一的 API 接口
 */
export const useCanvasUIData = (): CanvasUIDataApi => {
  const { loadState, saveState } = useCanvasPersistenceStore();

  // 创建 UI Store 实例
  const [store] = useState(() => createUIStore(loadState() ?? undefined));

  // 使用 ref 追踪是否已经初始化完成，避免首次加载时重复保存
  const isInitializedRef = useRef(false);

  // 持久化：监听 store 变化并建立订阅实时保存到 canvasPersistenceStore
  useEffect(() => {
    // 标记初始化完成
    isInitializedRef.current = true;

    // 订阅 store 变化
    const unsubscribe = store.subscribe((state) => {
      // 如果还未初始化完成，跳过保存（避免首次加载时重复保存）
      if (!isInitializedRef.current) return;

      // 构建要保存的状态
      const stateToSave = {
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        desmosPreviewLinks: state.desmosPreviewLinks,
      };

      // 保存到持久化存储
      saveState(stateToSave);
    });

    return unsubscribe;
  }, [store, saveState]);

  // 标记初始化完成（在首次渲染后）
  useEffect(() => {
    requestAnimationFrame(() => {
      isInitializedRef.current = true;
    });
  }, []);

  // 构建 API 对象
  const api = useMemo<CanvasUIDataApi>(() => {
    // 订阅来自 Eval 系统的变化
    const subscribeFromEval = (evalApi: CanvasEvalApi): (() => void) => {
      let prevEvalData: Record<string, { controls: NodeControls[] }> | undefined = undefined;
      const unsubscribe = evalApi.subscribeData((evalData) => {
        // 提取 controls 信息
        const currentEvalData: Record<string, { controls: NodeControls[] }> = {};
        Object.entries(evalData).forEach(([nodeId, nodeData]) => {
          currentEvalData[nodeId] = {
            controls: nodeData.controls || [],
          };
        });

        // 计算增量
        const delta = resolveEvalDataDelta(currentEvalData, prevEvalData);

        if (delta.hasChanges) {
          // 同步 controls 到节点数据中
          store.setState((draft) => {
            Object.entries(delta.updatedControls).forEach(([nodeId, controls]) => {
              const node = draft.nodes.find((n) => n.id === nodeId);
              if (!node) return;
              if (node.type === 'textNode') {
                // 更新节点数据中的 controls
                node.data.controls = controls;
              }
            });
          });
        }

        prevEvalData = currentEvalData;
      });

      return unsubscribe;
    };

    // 订阅 UI 数据变化
    const subscribeData = (
      callback: (data: UIData, prevData?: UIData) => void
    ): (() => void) => {
      return store.subscribe((state, prevState) => {
        const currentData = toUIData(state);
        const prevData = prevState ? toUIData(prevState) : undefined;
        callback(currentData, prevData);
      });
    };

    // 获取快照
    const getSnapshot = (): UIData => {
      return toUIData(store.getState());
    };

    // React Hook 形式的数据访问
    const useUIData = <T,>(selector: (data: UIData) => T): T => {
      return useStore(store, (state) => selector(toUIData(state)));
    };

    const useNodeData = (id: string): TextNodeData | DesmosPreviewNodeData | undefined => {
      return useUIData((data) => data.nodes.find((node) => node.id === id)?.data);
    };

    // 节点操作
    const addNode = (node: CanvasNode) =>
      store.setState(state => ({
        nodes: [...state.nodes, node]
      }));

    const updateNode = <T extends TextNodeType | DesmosPreviewNodeType>(id: string, updates: Partial<T>) =>
      store.setState(state => {
        const nodeIndex = state.nodes.findIndex((node) => node.id === id);
        if (nodeIndex === -1) return;
        if (state.nodes[nodeIndex].type === 'textNode') {
          state.nodes[nodeIndex] = { ...state.nodes[nodeIndex], ...updates };
        } else if (state.nodes[nodeIndex].type === 'desmosPreviewNode') {
          state.nodes[nodeIndex] = { ...state.nodes[nodeIndex], ...updates };
        }
      });
    
    const updateNodeData = (id: string, updates: Record<string, unknown>) =>
      store.setState(state => {
        const node = state.nodes.find((node) => node.id === id);
        if (!node) return;
        node.data = { ...node.data, ...updates };
      });

    const removeNode = (id: string) =>
      store.setState(state => {
        const { nodes, edges, desmosPreviewLinks } = state;
        const nextLinks: Record<string, DesmosPreviewLink> = { ...desmosPreviewLinks };

        const cleanedNodes = nodes.filter((node) => node.id !== id);
        const cleanedEdges = edges.filter((edge) => edge.source !== id && edge.target !== id);

        // 如果这是源节点，删除其预览节点及映射
        if (nextLinks[id]) {
          const previewId = nextLinks[id].previewNodeId;
          delete nextLinks[id];
          return {
            nodes: cleanedNodes.filter((node) => node.id !== previewId),
            edges: cleanedEdges.filter((edge) => edge.source !== previewId && edge.target !== previewId),
            desmosPreviewLinks: nextLinks,
          };
        }

        // 如果这是预览节点，找到对应源节点，移除映射
        const sourceEntry = Object.entries(nextLinks).find(([, link]) => link.previewNodeId === id);
        if (sourceEntry) {
          const [sourceId] = sourceEntry;
          delete nextLinks[sourceId];
        }

        return {
          nodes: cleanedNodes,
          edges: cleanedEdges,
          desmosPreviewLinks: nextLinks,
        };
      });

    const setNodes = (nodes: CanvasNode[]) =>
      store.setState(state => {
        const validIds = new Set(nodes.map((node) => node.id));

        const nextPreviewLinks: Record<string, DesmosPreviewLink> = {};
        Object.entries(state.desmosPreviewLinks).forEach(([sourceId, link]) => {
          if (validIds.has(sourceId) && validIds.has(link.previewNodeId)) {
            nextPreviewLinks[sourceId] = link;
          }
        });

        return {
          nodes,
          desmosPreviewLinks: nextPreviewLinks,
        };
      });

    // 边操作
    const addEdge = (edge: CanvasEdge) =>
      store.setState(state => ({
        edges: [...state.edges, edge]
      }));

    const updateEdge = (id: string, updates: Partial<CanvasEdge>) =>
      store.setState(state => {
        const edgeIndex = state.edges.findIndex((edge) => edge.id === id);
        if (edgeIndex === -1) return;
        state.edges[edgeIndex] = { ...state.edges[edgeIndex], ...updates };
      });

    const removeEdge = (id: string) =>
      store.setState(state => ({
        edges: state.edges.filter((edge) => edge.id !== id)
      }));

    const setEdges = (edges: CanvasEdge[]) =>
      store.setState({ edges });

    // 画布操作
    const setViewport = (viewport: Viewport) =>
      store.setState(state =>
        isSameViewport(state.viewport, viewport) ? {} : { viewport }
      );

    const clearCanvas = () =>
      store.setState({
        nodes: [],
        edges: [],
        viewport: defaultViewport,
        desmosPreviewLinks: {},
      });

    const resetToDefault = () =>
      store.setState({
        nodes: defaultCanvas.nodes,
        edges: defaultCanvas.edges,
        viewport: defaultCanvas.viewport ?? defaultViewport,
        desmosPreviewLinks: {},
      });

    // 导入/导出操作
    const importCanvasData = (data: {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
      viewport?: Viewport;
    }) => {
      setNodes(data.nodes);
      setEdges(data.edges);
      if (data.viewport) {
        setViewport(data.viewport);
      }
    };

    const exportCanvasData = (): {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
      viewport: Viewport;
    } => {
      const state = store.getState();
      return {
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
      };
    };

    // React Flow 集成
    const handleNodesChange = (changes: NodeChange[]) => {
      store.setState((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes) as CanvasNode[];
      });
    };

    const handleEdgesChange = (changes: EdgeChange[]) => {
      store.setState((state) => {
        state.edges = applyEdgeChanges(changes, state.edges) as CanvasEdge[];
      });
    };

    // 便捷创建操作
    const createEdge = (source: string, target: string, edgeData?: Partial<CanvasEdge>) => {
      const newEdge: CanvasEdge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source,
        target,
        type: 'custom',
        ...edgeData,
      };
      addEdge(newEdge);
      return newEdge;
    };

    // TextNode 操作
    const defaultTextNodeData: TextNodeData = {
      code: '',
      controls: [],
      autoResizeWidth: true,
      nodeName: '',
      isCollapsed: false,
      hiddenSections: {
        inputs: false,
        outputs: false,
        logs: false,
        errors: false,
      },
    };
    const createTextNode = (node: Partial<TextNodeType>) => {
      const newNode: TextNodeType = {
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'textNode',
        position: { x: 0, y: 0 },
        ...node,
        data: { ...defaultTextNodeData, ...node.data },
      };
      addNode(newNode);
      return newNode;
    };

    // Desmos 预览节点操作
    const createDesmosPreviewNode = ({ sourceNodeId, sourceOutputName, desmosState }: {
      sourceNodeId: string;
      sourceOutputName: string;
      desmosState: any;
    }) =>
      store.setState(state => {
        if (state.desmosPreviewLinks[sourceNodeId]) {
          return state;
        }

        const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
        if (!sourceNode) {
          return state;
        }

        const clonedState = (() => {
          try {
            return desmosState && typeof structuredClone === 'function'
              ? structuredClone(desmosState)
              : JSON.parse(JSON.stringify(desmosState ?? {}));
          } catch {
            return desmosState ?? {};
          }
        })();

        const previewNodeId = `desmos-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const offsetX = 420;
        const offsetY = 60;
        const previewIndex = Object.keys(state.desmosPreviewLinks).length;
        const previewNode: DesmosPreviewNodeType = {
          id: previewNodeId,
          type: 'desmosPreviewNode',
          position: {
            x: sourceNode.position.x + offsetX,
            y: sourceNode.position.y + previewIndex * offsetY,
          },
          data: {
            sourceNodeId,
            sourceOutputName,
            desmosState: clonedState,
          },
        };

        const previewEdge: CanvasEdge = {
          id: `edge-${sourceNodeId}-desmos-${Date.now()}`,
          source: sourceNodeId,
          target: previewNodeId,
          type: 'custom',
        };

        return {
          nodes: [...state.nodes, previewNode],
          edges: [...state.edges, previewEdge],
          desmosPreviewLinks: {
            ...state.desmosPreviewLinks,
            [sourceNodeId]: {
              previewNodeId,
              outputName: sourceOutputName,
            },
          },
        };
      });

    const updateDesmosPreviewState = (sourceNodeId: string, desmosState: any) =>
      store.setState(state => {
        const link = state.desmosPreviewLinks[sourceNodeId];
        if (!link) {
          return state;
        }

        const previewNodeId = link.previewNodeId;
        const cloneState = (() => {
          try {
            return desmosState && typeof structuredClone === 'function'
              ? structuredClone(desmosState)
              : JSON.parse(JSON.stringify(desmosState ?? {}));
          } catch {
            return desmosState ?? {};
          }
        })();

        const updatedNodes = state.nodes.map((node) => {
          if (node.id !== previewNodeId) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              desmosState: cloneState,
            },
          };
        });

        return {
          ...state,
          nodes: updatedNodes,
        };
      });

    // 更新节点的 control 值（用于用户交互）
    const updateNodeControlValues = (nodeId: string, values: Record<string, unknown>) =>
      store.setState(state => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (node.type === 'textNode' && node.data.controls) {
          node.data.controls.forEach((control) => {
            if (Object.prototype.hasOwnProperty.call(values, control.name)) {
              control.value = values[control.name];
            }
          });
        }
      });

    const updateNodeControlValue = (nodeId: string, controlName: string, value: unknown) =>
      store.setState(state => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (node.type === 'textNode' && node.data.controls) {
          const control = node.data.controls.find((control) => control.name === controlName);
          if (!control) return;
          control.value = value;
        }
      });

    return {
      subscribeFromEval,
      subscribeData,
      getSnapshot,
      useUIData,
      useNodeData,
      addNode,
      updateNode,
      updateNodeData,
      removeNode,
      setNodes,
      addEdge,
      updateEdge,
      removeEdge,
      setEdges,
      setViewport,
      clearCanvas,
      resetToDefault,
      importCanvasData,
      exportCanvasData,
      handleNodesChange,
      handleEdgesChange,
      createEdge,
      defaultTextNodeData,
      createTextNode,
      createDesmosPreviewNode,
      updateDesmosPreviewState,
      updateNodeControlValues,
      updateNodeControlValue,
    };
  }, [store]);

  return api;
};

