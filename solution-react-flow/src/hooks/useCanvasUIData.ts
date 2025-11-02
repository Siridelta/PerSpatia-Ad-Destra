import { useEffect, useMemo, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { CanvasPersistedState, useCanvasPersistenceStore } from '@/store/canvasPersistenceStore';
import { CanvasEvalApi } from './useCanvasEval';
import type { CanvasNode, CanvasEdge, TextNodeType, DesmosPreviewNodeType, DesmosPreviewEdge, CustomCanvasEdge } from '@/types/canvas';
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type Viewport } from '@xyflow/react';
import type { Control } from '@/services/jsExecutor';
import { DesmosPreviewNodeData, TextNodeData } from '@/types/nodeData';


export interface UIStoreState {
  // 状态数据
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
}

/**
 * UI 数据接口
 * 提供给外部订阅的统一数据结构
 */
export interface UIData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
}

/**
 * UI Data API 接口
 * 封装 UI 状态管理的所有操作
 */
export interface CanvasUIDataApi {
  // 订阅方法
  subscribeFromEval: (evalApi: CanvasEvalApi) => () => void;
  subscribeData: (callback: (data: UIData) => void) => () => void;

  // 数据访问方法
  getSnapshot: () => UIData;
  useUIData: <T>(selector: (data: UIData) => T) => T;
  useNodeData: (id: string) => TextNodeData | DesmosPreviewNodeData | undefined;

  // 节点操作
  addNode: <NodeType extends CanvasNode>(node: NodeType) => void;
  updateNode: <NodeType extends CanvasNode>(id: string, updates: Partial<NodeType>) => void;
  updateNodeData: (id: string, updates: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  setNodes: (nodes: CanvasNode[]) => void;

  // 边操作
  addEdge: <EdgeType extends CanvasEdge>(edge: EdgeType) => void;
  updateEdge: <EdgeType extends CanvasEdge>(id: string, updates: Partial<EdgeType>) => void;
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
  createDepEdge: (source: string, target: string, edgeData?: Partial<CustomCanvasEdge>) => CustomCanvasEdge;

  // TextNode 操作
  defaultTextNodeData: TextNodeData;
  createTextNode: (node: Partial<TextNodeType>) => void;

  // Desmos 预览节点操作
  createDesmosPreviewNode: (params: { sourceNodeId: string; sourceOutputName: string }) => void;

  // Controls 操作
  updateNodeControlValues: (nodeId: string, values: Record<string, unknown>) => void;
  updateNodeControlValue: (nodeId: string, controlName: string, value: unknown) => void;
}



// 默认节点和边的数据
import defaultCanvas from '@/components/Canvas/defaultCanvas';
import { immer } from 'zustand/middleware/immer';

// 默认视角（React Flow 默认值）
const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

const isDesmosPreviewEdge = (edge: CanvasEdge): edge is DesmosPreviewEdge => edge.type === 'desmosPreviewEdge';

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

  return createStore<UIStoreState>()(
    immer(() => ({
      // 初始状态
      nodes: initialNodes,
      edges: initialEdges,
      viewport: initialViewport,
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
});

/**
 * 计算 EvalData 变化的增量
 */
interface EvalDataDelta {
  updatedControls: Record<string, Control[]>;
  hasChanges: boolean;
}

const resolveDeltaByEvalData = (
  currentEvalData: Record<string, { controls: Control[] }>,
  prevState?: UIStoreState
): EvalDataDelta => {
  if (!prevState) {
    // 首次初始化，所有 controls 都是新的
    const updatedControls: Record<string, Control[]> = {};
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

  const updatedControls: Record<string, Control[]> = {};

  // 检查每个节点的 controls 是否有变化
  Object.entries(currentEvalData).forEach(([nodeId, nodeData]) => {
    const prevNode = prevState.nodes.find((node) => node.id === nodeId);
    if (!prevNode || prevNode.type !== 'textNode') return;
    const prevControls = prevNode.data.controls || [];
    const currentControls = nodeData.controls || [];
    let hasChanges = false;

    for (const control of currentControls) {
      const prevControl = prevControls.find((c) => c.name === control.name);
      if (!prevControl
         || prevControl.defaultValue !== control.defaultValue
         || prevControl.type !== control.type
         || prevControl.value !== control.value
         || prevControl.min !== control.min
         || prevControl.max !== control.max
         || prevControl.step !== control.step
        ) {
        hasChanges = true;
        break;
      }
    }
    for (const control of prevControls) {
      if (!currentControls.find((c) => c.name === control.name)) {
        hasChanges = true;
        break;
      }
    }
    if (hasChanges) {
      updatedControls[nodeId] = currentControls;
    }
  });

  // 检查是否有节点被删除
  prevState.nodes.forEach((node) => {
    if (node.type === 'textNode' && !currentEvalData[node.id]) {
      updatedControls[node.id] = [];
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
 * 
 * DO NOT USE THIS HOOK BELOW CanvasUIDataContext!!!
 * FOR BELOW-CONTEXT USAGE, USE useCanvasUIDataApi TO GET THE API OBJECT!!!
 * This hook is intended for canvas overall state management, one instance per canvas.
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
      };

      // 保存到持久化存储
      saveState(stateToSave);
    });

    return () => { unsubscribe(); };
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
      const unsubscribe = evalApi.subscribeData(async (evalData) => {
        // 提取 controls 信息
        const currNodesControls: Record<string, { controls: Control[] }> = {};
        Object.entries(evalData).forEach(([nodeId, nodeData]) => {
          currNodesControls[nodeId] = {
            controls: nodeData.controls || [],
          };
        });

        // 计算增量
        const delta = resolveDeltaByEvalData(currNodesControls, store.getState());

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
      });

      return unsubscribe;
    };

    // 订阅 UI 数据变化
    const subscribeData = (
      callback: (data: UIData) => void
    ): (() => void) => {
      return store.subscribe((state) => {
        const currentData = toUIData(state);
        callback(currentData);
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
    const addNode = <NodeType extends CanvasNode>(node: NodeType) =>
      store.setState(state => ({
        nodes: [...state.nodes, node]
      }));

    const updateNode = <NodeType extends CanvasNode>(id: string, updates: Partial<NodeType>) =>
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
        const targetNode = state.nodes.find((node) => node.id === id);
        if (!targetNode) {
          return;
        }

        const nodesToRemove = new Set<string>([id]);

        if (targetNode.type === 'textNode') {
          state.edges.forEach((edge) => {
            if (isDesmosPreviewEdge(edge) && edge.source === id) {
              nodesToRemove.add(edge.target);
            }
          });
        }

        state.nodes = state.nodes.filter((node) => !nodesToRemove.has(node.id));
        state.edges = state.edges.filter((edge) => !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target));
      });

    const setNodes = (nodes: CanvasNode[]) =>
      store.setState({ nodes });

    // 边操作
    const addEdge = <EdgeType extends CanvasEdge>(edge: EdgeType) =>
      store.setState(state => ({
        edges: [...state.edges, edge]
      }));

    const updateEdge = <EdgeType extends CanvasEdge>(id: string, updates: Partial<EdgeType>) =>
      store.setState(state => {
        const edgeIndex = state.edges.findIndex((edge) => edge.id === id);
        if (edgeIndex === -1) return;
        Object.assign(state.edges[edgeIndex], updates);
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
      });

    const resetToDefault = () =>
      store.setState({
        nodes: defaultCanvas.nodes,
        edges: defaultCanvas.edges,
        viewport: defaultCanvas.viewport ?? defaultViewport,
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
        state.nodes = applyNodeChanges(
          changes,
          state.nodes.map((node) => {
            if (node.measured) {
              return { ...node, measured: { ...node.measured } }
            }
            return node;
          })
        ) as CanvasNode[];
      });
    };

    const handleEdgesChange = (changes: EdgeChange[]) => {
      store.setState((state) => {
        state.edges = applyEdgeChanges(changes, state.edges) as CanvasEdge[];
      });
    };

    // 便捷创建操作
    const createDepEdge = (source: string, target: string, edgeData?: Partial<CustomCanvasEdge>) => {
      const newEdge: CustomCanvasEdge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source,
        target,
        type: 'custom',
        data: edgeData?.data ?? {},
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
    const createDesmosPreviewNode = ({ sourceNodeId, sourceOutputName }: {
      sourceNodeId: string;
      sourceOutputName: string;
    }) =>
      store.setState(state => {
        const duplicatedEdge = state.edges.some(
          (edge) =>
            isDesmosPreviewEdge(edge) &&
            edge.source === sourceNodeId &&
            edge.data?.sourceOutputName === sourceOutputName,
        );
        if (duplicatedEdge) {
          return;
        }

        const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
        if (!sourceNode) {
          return;
        }

        const previewNodeId = `desmos-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const offsetX = 420;
        const offsetY = 60;
        const existingPreviewCount = state.edges.filter(
          (edge) => isDesmosPreviewEdge(edge) && edge.source === sourceNodeId,
        ).length;
        const position = {
          x: sourceNode.position.x + offsetX,
          y: sourceNode.position.y + existingPreviewCount * offsetY,
        };

        const previewNode: DesmosPreviewNodeType = {
          id: previewNodeId,
          type: 'desmosPreviewNode',
          position,
          data: {},
        };

        const previewEdge: DesmosPreviewEdge = {
          id: `edge-${sourceNodeId}-desmos-${Date.now()}`,
          source: sourceNodeId,
          target: previewNodeId,
          type: 'desmosPreviewEdge',
          data: {
            sourceOutputName,
          },
        };

        state.nodes.push(previewNode);
        state.edges.push(previewEdge);
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
      createDepEdge,
      defaultTextNodeData,
      createTextNode,
      createDesmosPreviewNode,
      updateNodeControlValues,
      updateNodeControlValue,
    };
  }, [store]);

  return api;
};

