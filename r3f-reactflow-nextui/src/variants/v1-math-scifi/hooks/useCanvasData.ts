import { useMemo, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { CanvasEvalApi } from './useCanvasEval';
import type {
  CanvasNodeUIData,
  CanvasEdgeUIData,
  CustomEdgePayload,
  TextNodePayload,
} from '@v1/types/canvas';
import { CanvasEdgeKind, CanvasNodeKind } from '@v1/types/canvas';
import type { Control } from '@v1/services/jsExecutor';
import { DesmosPreviewNodeUIData, TextNodeUIData } from '@v1/types/nodeData';
import defaultCanvas from '@v1/components/Canvas/defaultCanvas';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange } from '@xyflow/react';
import { CanvasEdgeFlowData, CanvasNodeFlowData } from '@v1/types/canvas';
import type { CanvasArchiveState } from '@v1/types/persistence';
import type { CameraState } from '@v1/components/CameraControl';
import {
  DEFAULT_CAMERA_OPTIONS,
  DEFAULT_SPHERICAL_PHI,
  DEFAULT_SPHERICAL_THETA,
} from '@v1/components/CameraControl';

// Canvas store 已使用 Map 结构，需显式启用 Immer 的 Map/Set 支持。
enableMapSet();



/**
 * 单一数据源（canvas store）：
 * - uiData: 业务层数据（code、controls、折叠状态等）
 * - flowData: React Flow 渲染层数据（仅 nodes/edges；**不含** RF viewport，视口由 ReactFlow3D + 相机 store 推导）
 * - camera: 与持久化 `CanvasArchiveState.camera` 对齐；由 CameraControl `onPersist` 低频写入
 */
export interface CanvasStoreState {
  nodes: Map<string, CanvasNodeUIData>;
  edges: Map<string, CanvasEdgeUIData>;
  flowNodes: CanvasNodeFlowData[];
  flowEdges: CanvasEdgeFlowData[];
  camera: CameraState;
}

export interface CanvasUIData {
  nodes: Map<string, CanvasNodeUIData>;
  edges: Map<string, CanvasEdgeUIData>;
}

export interface FlowData {
  nodes: CanvasNodeFlowData[];
  edges: CanvasEdgeFlowData[];
}

export interface CanvasDataApi {
  readUI: {
    // ---- UI 快照读取 ----
    getUISnapShot: () => CanvasUIData;
    useUIData: <T>(selector: (data: CanvasUIData) => T) => T;
    useNodeUIData: (id: string) => TextNodeUIData | DesmosPreviewNodeUIData | undefined;
    defaultTextNodeData: TextNodeUIData;
  };
  readFlow: {
    // ---- Flow 快照读取（仅图；视口不在此层）----
    getFlowSnapshot: () => FlowData;
    useFlowData: <T>(selector: (data: FlowData) => T) => T;
  };
  readCamera: {
    getCameraSnapshot: () => CameraState;
    useCamera: <T>(selector: (camera: CameraState) => T) => T;
  };
  subscribe: {
    // ---- UI 数据订阅 ----
    onData: (callback: (data: CanvasUIData) => void) => () => void;
  };
  bridge: {
    // ---- Eval -> UI 桥接 ----
    connectEval: (evalApi: CanvasEvalApi) => () => void;
  };
  writeUI: {
    // ---- UI 非结构写入（局部字段、控件值）----
    updateNode: <NodeType extends CanvasNodeUIData>(id: string, updates: Partial<NodeType>) => void;
    updateNodeData: (id: string, updates: Record<string, unknown>) => void;
    updateNodeControlValues: (nodeId: string, values: Record<string, unknown>) => void;
    updateNodeControlValue: (nodeId: string, controlName: string, value: unknown) => void;
  };
  writeFlow: {
    // ---- Flow 非结构写入（节点选中/拖拽等）----
    handleFlowNodesChange: (changes: NodeChange[]) => void;
    handleFlowEdgesChange: (changes: EdgeChange[]) => void;
  };
  writeCamera: {
    /** 相机松手/切页等时机写入，供持久化订阅；与 CameraControl 真源对齐 */
    setCamera: (camera: CameraState) => void;
  };
  graph: {
    // ---- 图结构入口（会同步更新 uiData + flowData）----
    // 返回值只用于标识新创建实体的 identity，不代表可变数据快照。
    createDepEdge: (input: {
      id?: string;
      sourceId: string;
      targetId: string;
      data?: CustomEdgePayload;
    }) => string;
    // 返回新建节点 id；节点内容请通过 store selector 获取最新值。
    createTextNode: (input?: {
      id?: string;
      position?: { x: number; y: number };
      data?: Partial<TextNodePayload>;
    }) => string;
    // 若 source/output 组合已存在预览边，则返回 null（幂等保护）。
    createDesmosPreviewNode: (input: {
      nodeId?: string;
      edgeId?: string;
      sourceNodeId: string;
      sourceOutputName: string;
    }) => { nodeId: string; edgeId: string } | null;
    removeNode: (id: string) => void;
    removeEdge: (id: string) => void;
    clearCanvas: () => void;
    resetToDefault: () => void;
  };
  porting: {
    // ---- 导入导出（持久化/迁移边界）----
    importCanvasData: (state: CanvasArchiveState) => void;
    exportUIData: () => CanvasUIData;
    exportFlowData: () => FlowData;
    exportCanvasData: () => CanvasArchiveState;
  };
}

const isDesmosPreviewEdge = (edge: CanvasEdgeUIData) =>
  edge.type === CanvasEdgeKind.DesmosPreviewEdge;

const defaultTextNodeData: TextNodeUIData = {
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

// ---- normalize helpers: 外部输入 -> 内部规范数据 ----
type RawNodeRecord = Record<string, { type?: unknown; data?: unknown }>;
type RawEdgeRecord = Record<string, { source?: unknown; target?: unknown; type?: unknown; data?: unknown }>;

const normalizeUINodes = (nodes: RawNodeRecord): Map<string, CanvasNodeUIData> => {
  const mapped = new Map<string, CanvasNodeUIData>();
  const entries = Object.entries(nodes ?? {});
  entries.forEach(([id, node]) => {
    if (!id) return;
    if (node?.type === CanvasNodeKind.DesmosPreviewNode || node?.type === 'desmosPreviewNode') {
      mapped.set(id, {
        type: CanvasNodeKind.DesmosPreviewNode,
        data: (node?.data ?? {}) as DesmosPreviewNodeUIData,
      });
      return;
    }

    mapped.set(id, {
      type: CanvasNodeKind.TextNode,
      data: { ...defaultTextNodeData, ...(node?.data ?? {}) },
    });
  });
  return mapped;
};

const normalizeUIEdges = (edges: RawEdgeRecord): Map<string, CanvasEdgeUIData> => {
  const mapped = new Map<string, CanvasEdgeUIData>();
  const entries = Object.entries(edges ?? {});
  entries
    .filter(([edgeId, edge]) => edgeId && edge?.source && edge?.target)
    .forEach(([edgeId, edge]) => {
      if (edge.type === CanvasEdgeKind.DesmosPreviewEdge || edge.type === 'desmosPreviewEdge') {
        const desmosData = (edge.data ?? {}) as { sourceOutputName?: unknown };
        mapped.set(edgeId, {
          source: String(edge.source),
          target: String(edge.target),
          type: CanvasEdgeKind.DesmosPreviewEdge,
          data: {
            sourceOutputName: String(desmosData.sourceOutputName ?? ''),
          },
        });
        return;
      }

      mapped.set(edgeId, {
        source: String(edge.source),
        target: String(edge.target),
        type: CanvasEdgeKind.CustomEdge,
        data: (edge?.data ?? {}) as Record<string, unknown>,
      });
    });
  return mapped;
};

const normalizeFlowNodes = (nodes: any[]): CanvasNodeFlowData[] =>
  nodes.map((node) => ({
    id: String(node.id),
    type: node?.type === CanvasNodeKind.DesmosPreviewNode ? CanvasNodeKind.DesmosPreviewNode : CanvasNodeKind.TextNode,
    position: node?.position ?? { x: 0, y: 0 },
    data: {},
    selected: Boolean(node?.selected),
    dragging: Boolean(node?.dragging),
  }));

const normalizeFlowEdges = (edges: any[]): CanvasEdgeFlowData[] =>
  edges
    .filter((edge) => edge?.id && edge?.source && edge?.target)
    .map((edge) => ({
      id: String(edge.id),
      source: String(edge.source),
      target: String(edge.target),
      type: edge?.type === CanvasEdgeKind.DesmosPreviewEdge ? CanvasEdgeKind.DesmosPreviewEdge : CanvasEdgeKind.CustomEdge,
      data: {},
      selected: Boolean(edge?.selected),
    }));

const getDefaultUIData = (): CanvasUIData => ({
  nodes: normalizeUINodes(defaultCanvas.uiData.nodes),
  edges: normalizeUIEdges(defaultCanvas.uiData.edges),
});

const getDefaultFlowData = (): FlowData => ({
  nodes: normalizeFlowNodes(defaultCanvas.flowData.nodes),
  edges: normalizeFlowEdges(defaultCanvas.flowData.edges),
});

/**
 * **默认模板相机**（default canvas template）：
 * 来自 `defaultCanvas`（迁移后的模板存档）里的 `camera` 字段；
 */
const getDefaultCanvasCamera = (): CameraState => defaultCanvas.camera;

/**
 * **空白画布相机**（cleared / empty graph）：
 * 在「图上已无任何内容」时使用的相机快照，与 **默认模板 JSON** 无关。
 * 数值取 `DEFAULT_CAMERA_OPTIONS` / 球角常量，表示引擎层面的原点视角。
 */
const getBlankCanvasCamera = (): CameraState => ({
  orbitCenterX: 0,
  orbitCenterY: 0,
  radius: DEFAULT_CAMERA_OPTIONS.initialRadius,
  theta: DEFAULT_SPHERICAL_THETA,
  phi: DEFAULT_SPHERICAL_PHI,
});

const createCanvasStore = (initial?: Partial<CanvasArchiveState>) =>
  createStore<CanvasStoreState>()(
    immer(() => {
      const defaultFlow = getDefaultFlowData();
      return {
        nodes: normalizeUINodes(initial?.uiData?.nodes ?? defaultCanvas.uiData.nodes),
        edges: normalizeUIEdges(initial?.uiData?.edges ?? defaultCanvas.uiData.edges),
        flowNodes: initial?.flowData?.nodes ?? defaultFlow.nodes,
        flowEdges: initial?.flowData?.edges ?? defaultFlow.edges,
        camera: initial?.camera ?? getDefaultCanvasCamera() ?? getBlankCanvasCamera(),
      };
    })
  );

// 从完整 store 派生只读分片快照（ui / flow / camera）
const toUIDataSlice = (state: CanvasStoreState): CanvasUIData => ({
  nodes: state.nodes,
  edges: state.edges,
});

const toFlowDataSlice = (state: CanvasStoreState): FlowData => ({
  nodes: state.flowNodes,
  edges: state.flowEdges,
});

const toCameraSlice = (state: CanvasStoreState): CameraState => state.camera;

const serializeUINodes = (nodesMap: Map<string, CanvasNodeUIData>): Record<string, CanvasNodeUIData> => {
  const serialized: Record<string, CanvasNodeUIData> = {};
  nodesMap.forEach((node, id) => {
    if (node.type === CanvasNodeKind.TextNode) {
      serialized[id] = {
        type: CanvasNodeKind.TextNode,
        data: node.data as TextNodeUIData,
      };
      return;
    }
    serialized[id] = {
      type: CanvasNodeKind.DesmosPreviewNode,
      data: node.data as DesmosPreviewNodeUIData,
    };
  });
  return serialized;
};

const serializeUIEdges = (edgesMap: Map<string, CanvasEdgeUIData>): Record<string, CanvasEdgeUIData> =>
  Object.fromEntries(edgesMap.entries());

interface EvalDataDelta {
  updatedControls: Record<string, Control[]>;
  hasChanges: boolean;
}

const resolveDeltaByEvalData = (
  currentEvalData: Record<string, { controls: Control[] }>,
  prevState?: CanvasStoreState
): EvalDataDelta => {
  if (!prevState) {
    const updatedControls: Record<string, Control[]> = {};
    Object.entries(currentEvalData).forEach(([nodeId, nodeData]) => {
      if (nodeData.controls.length > 0) updatedControls[nodeId] = nodeData.controls;
    });
    return { updatedControls, hasChanges: Object.keys(updatedControls).length > 0 };
  }

  const updatedControls: Record<string, Control[]> = {};
  Object.entries(currentEvalData).forEach(([nodeId, nodeData]) => {
    const prevNode = prevState.nodes.get(nodeId);
    if (!prevNode || prevNode.type !== CanvasNodeKind.TextNode) return;

    const prevControls = (prevNode.data.controls ?? []) as Control[];
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
    if (hasChanges) updatedControls[nodeId] = currentControls;
  });

  prevState.nodes.forEach((node, nodeId) => {
    if (node.type === CanvasNodeKind.TextNode && !currentEvalData[nodeId]) {
      updatedControls[nodeId] = [];
    }
  });

  return { updatedControls, hasChanges: Object.keys(updatedControls).length > 0 };
};

export const useCanvasData = (): CanvasDataApi => {
  const [store] = useState(() => createCanvasStore());

  const api = useMemo<CanvasDataApi>(() => {
    // ----------------------------------------------------------------
    // 1) Eval -> UI controls 回写
    // ----------------------------------------------------------------
    const connectEval = (evalApi: CanvasEvalApi): (() => void) => {
      const unsubscribe = evalApi.subscribe.onData((evalData) => {
        const currNodesControls: Record<string, { controls: Control[] }> = {};
        Object.entries(evalData).forEach(([nodeId, nodeData]) => {
          currNodesControls[nodeId] = { controls: nodeData.controls || [] };
        });

        const delta = resolveDeltaByEvalData(currNodesControls, store.getState());
        if (!delta.hasChanges) return;

        store.setState((state) => {
          const nextNodes = new Map(state.nodes);
          let changed = false;
          Object.entries(delta.updatedControls).forEach(([nodeId, controls]) => {
            const node = nextNodes.get(nodeId);
            if (!node || node.type !== CanvasNodeKind.TextNode) return;
            nextNodes.set(nodeId, {
              ...node,
              data: {
                ...node.data,
                controls,
              },
            });
            changed = true;
          });
          return changed ? { nodes: nextNodes } : state;
        });
      });
      return unsubscribe;
    };

    // ----------------------------------------------------------------
    // 2) UI 分片 - 读取 API
    // ----------------------------------------------------------------
    const onData = (callback: (data: CanvasUIData) => void): (() => void) =>
      store.subscribe((state) => callback(toUIDataSlice(state)));

    const getUISnapShot = (): CanvasUIData => toUIDataSlice(store.getState());

    // 保持 selector 输入引用稳定，避免无关重渲染。
    const useUIData = <T,>(selector: (data: CanvasUIData) => T): T => {
      const prevStateRef = useRef<CanvasStoreState>(store.getState());
      const prevDataRef = useRef<CanvasUIData>(toUIDataSlice(prevStateRef.current));
      return useStore(store, (state): T => {
        if (prevStateRef.current !== state) {
          prevStateRef.current = state;
          prevDataRef.current = toUIDataSlice(state);
        }
        return selector(prevDataRef.current);
      });
    };

    const useNodeUIData = (id: string): TextNodeUIData | DesmosPreviewNodeUIData | undefined =>
      useUIData((data) => data.nodes.get(id)?.data);

    // ----------------------------------------------------------------
    // 3) UI 分片 - 写入 API
    // ----------------------------------------------------------------
    const updateNode = <NodeType extends CanvasNodeUIData>(id: string, updates: Partial<NodeType>) =>
      store.setState((state) => {
        const prevNode = state.nodes.get(id);
        if (!prevNode) return state;
        const { id: _ignored, ...rest } = updates as Partial<NodeType> & { id?: string };
        const nextNodes = new Map(state.nodes);
        const nextNode = { ...prevNode, ...rest };
        nextNodes.set(id, nextNode);
        if (rest.type) {
          return {
            nodes: nextNodes,
            flowNodes: state.flowNodes.map((flowNode) =>
              flowNode.id === id ? { ...flowNode, type: rest.type as CanvasNodeKind } : flowNode
            ),
          };
        }
        return { nodes: nextNodes };
      });

    const updateNodeData = (id: string, updates: Record<string, unknown>) =>
      store.setState((state) => {
        const node = state.nodes.get(id);
        if (!node) return state;
        const nextNodes = new Map(state.nodes);
        if (node.type === CanvasNodeKind.TextNode) {
          nextNodes.set(id, {
            ...node,
            data: { ...node.data, ...updates },
          });
        } else {
          nextNodes.set(id, {
            ...node,
            data: { ...node.data, ...updates },
          });
        }
        return { nodes: nextNodes };
      });

    const removeNode = (id: string) => {
      const nodesToRemove = new Set<string>([id]);
      const snapshot = store.getState();
      const targetNode = snapshot.nodes.get(id);

      if (targetNode?.type === CanvasNodeKind.TextNode) {
        snapshot.edges.forEach((edge) => {
          if (isDesmosPreviewEdge(edge) && edge.source === id) {
            nodesToRemove.add(edge.target);
          }
        });
      }

      store.setState((state) => {
        const nextNodes = new Map(state.nodes);
        nodesToRemove.forEach((nodeId) => nextNodes.delete(nodeId));

        const nextEdges = new Map<string, CanvasEdgeUIData>();
        state.edges.forEach((edge, edgeId) => {
          if (!nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target)) {
            nextEdges.set(edgeId, edge);
          }
        });

        return {
          nodes: nextNodes,
          edges: nextEdges,
          flowNodes: state.flowNodes.filter((node) => !nodesToRemove.has(node.id)),
          flowEdges: state.flowEdges.filter((edge) => !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target)),
        };
      });
    };

    const removeEdge = (id: string) => {
      store.setState((state) => {
        const nextEdges = new Map(state.edges);
        nextEdges.delete(id);
        return {
          edges: nextEdges,
          flowEdges: state.flowEdges.filter((edge) => edge.id !== id),
        };
      });
    };

    const clearCanvas = () => 
      store.setState({
        nodes: new Map(),
        edges: new Map(),
        flowNodes: [],
        flowEdges: [],
        camera: getBlankCanvasCamera(),
      });

    const resetToDefault = () => {
      const defaultUI = getDefaultUIData();
      const defaultFlow = getDefaultFlowData();
      store.setState({
        ...defaultUI,
        flowNodes: defaultFlow.nodes,
        flowEdges: defaultFlow.edges,
        camera: getDefaultCanvasCamera(),
      });
    };

    const exportUIData = (): CanvasUIData => toUIDataSlice(store.getState());

    // ----------------------------------------------------------------
    // 4) Flow 分片 - 读取 API
    // ----------------------------------------------------------------
    const getFlowSnapshot = (): FlowData => toFlowDataSlice(store.getState());

    // 与 useUIData 相同的稳定策略，用于 flow 分片订阅。
    const useFlowData = <T,>(selector: (data: FlowData) => T): T => {
      const prevStateRef = useRef<CanvasStoreState>(store.getState());
      const prevDataRef = useRef<FlowData>(toFlowDataSlice(prevStateRef.current));
      return useStore(store, (state): T => {
        if (prevStateRef.current !== state) {
          prevStateRef.current = state;
          prevDataRef.current = toFlowDataSlice(state);
        }
        return selector(prevDataRef.current);
      });
    };

    // ----------------------------------------------------------------
    // 5) Flow 分片 - 写入 API
    // ----------------------------------------------------------------

    const handleFlowNodesChange = (changes: NodeChange[]) => {
      const nonStructuralChanges = changes.filter((change) => change.type !== 'add' && change.type !== 'remove' && change.type !== 'replace');
      store.setState((state) => ({
        flowNodes: applyNodeChanges(nonStructuralChanges, state.flowNodes) as CanvasNodeFlowData[],
      }));
    };

    const handleFlowEdgesChange = (changes: EdgeChange[]) => {
      const nonStructuralChanges = changes.filter((change) => change.type !== 'add' && change.type !== 'remove' && change.type !== 'replace');
      store.setState((state) => ({
        flowEdges: applyEdgeChanges(nonStructuralChanges, state.flowEdges) as CanvasEdgeFlowData[],
      }));
    };

    const exportFlowData = (): FlowData => toFlowDataSlice(store.getState());

    // ----------------------------------------------------------------
    // 6) Camera 分片 - 读取 & 写入（低频写入，写入仅用于持久化）
    // ----------------------------------------------------------------
    const getCameraSnapshot = (): CameraState => toCameraSlice(store.getState());

    const isSameCamera = (a: CameraState, b: CameraState) => (
      a.orbitCenterX === b.orbitCenterX &&
      a.orbitCenterY === b.orbitCenterY &&
      a.radius === b.radius &&
      a.theta === b.theta &&
      a.phi === b.phi
    );

    const useCamera = <T,>(selector: (camera: CameraState) => T): T => {
      const prevStateRef = useRef<CanvasStoreState>(store.getState());
      const prevCamRef = useRef<CameraState>(toCameraSlice(prevStateRef.current));
      return useStore(store, (state): T => {
        if (prevStateRef.current !== state) {
          prevStateRef.current = state;
          prevCamRef.current = toCameraSlice(state);
        }
        return selector(prevCamRef.current);
      });
    };

    const setCamera = (next: CameraState) => {
      store.setState((draft) => {
        const prev = draft.camera;
        if (isSameCamera(prev, next)) return;
        draft.camera = { ...next };
      });
    };

    // ----------------------------------------------------------------
    // 6) Canvas 原子导入/导出（UI + Flow 一起）
    // ----------------------------------------------------------------
    const importCanvasData = (state: CanvasArchiveState) => {
      // 原子导入：一次 setState 同步更新 ui/flow/camera，避免中间态被副作用消费
      store.setState({
        nodes: normalizeUINodes(state.uiData.nodes ?? {}),
        edges: normalizeUIEdges(state.uiData.edges ?? {}),
        flowNodes: normalizeFlowNodes(state.flowData.nodes ?? []),
        flowEdges: normalizeFlowEdges(state.flowData.edges ?? []),
        camera: state.camera ?? getBlankCanvasCamera(),
      });
    };

    const exportCanvasData = (): CanvasArchiveState => {
      const state = store.getState();
      return {
        uiData: {
          nodes: serializeUINodes(state.nodes),
          edges: serializeUIEdges(state.edges),
        },
        flowData: {
          nodes: state.flowNodes,
          edges: state.flowEdges,
        },
        camera: state.camera,
      };
    };

    // ----------------------------------------------------------------
    // 7) 业务便捷方法（创建节点/边、更新 controls）
    // ----------------------------------------------------------------
    // 只返回 edgeId，不返回对象快照，避免调用方误把返回值当成真源数据。
    const createDepEdge = (input: {
      id?: string;
      sourceId: string;
      targetId: string;
      data?: CustomEdgePayload;
    }) => {
      const { id, sourceId, targetId, data } = input;
      const edgeId = id ?? `edge-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const newEdge: CanvasEdgeUIData = {
        source: sourceId,
        target: targetId,
        type: CanvasEdgeKind.CustomEdge,
        data: data ?? {},
      };
      const flowEdge: CanvasEdgeFlowData = {
        id: edgeId,
        source: sourceId,
        target: targetId,
        type: CanvasEdgeKind.CustomEdge,
        data: {},
      };
      store.setState((state) => {
        const nextEdges = new Map(state.edges);
        nextEdges.set(edgeId, newEdge);
        return {
          edges: nextEdges,
          flowEdges: [...state.flowEdges, flowEdge],
        };
      });
      return edgeId;
    };

    // 只返回 nodeId；节点数据统一从 store 读取，保证读取到的是最新状态。
    const createTextNode = (input?: {
      id?: string;
      position?: { x: number; y: number };
      data?: Partial<TextNodePayload>;
    }) => {
      const nodeId = input?.id ?? `node-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const uiNode: CanvasNodeUIData = {
        type: CanvasNodeKind.TextNode,
        data: { ...defaultTextNodeData, ...(input?.data ?? {}) },
      };
      const flowNode: CanvasNodeFlowData = {
        id: nodeId,
        type: CanvasNodeKind.TextNode,
        position: input?.position ?? { x: 0, y: 0 },
        data: {},
      };
      store.setState((state) => {
        const nextNodes = new Map(state.nodes);
        nextNodes.set(nodeId, uiNode);
        return {
          nodes: nextNodes,
          flowNodes: [...state.flowNodes, flowNode],
        };
      });
      return nodeId;
    };

    // 预览节点创建是幂等的：同 sourceNodeId+sourceOutputName 已存在时不重复创建。
    const createDesmosPreviewNode = (input: {
      nodeId?: string;
      edgeId?: string;
      sourceNodeId: string;
      sourceOutputName: string;
    }) => {
      const {
        nodeId,
        edgeId,
        sourceNodeId,
        sourceOutputName,
      } = input;
      const snapshot = store.getState();
      const duplicatedEdge = Array.from(snapshot.edges.values()).some(
        (edge) =>
          isDesmosPreviewEdge(edge) &&
          edge.source === sourceNodeId &&
          edge.data?.sourceOutputName === sourceOutputName,
      );
      if (duplicatedEdge) return null;

      const previewNodeId = nodeId ?? `desmos-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sourceFlowNode = snapshot.flowNodes.find((node) => node.id === sourceNodeId);
      const existingPreviewCount = Array.from(snapshot.edges.values()).filter(
        (edge) =>
          isDesmosPreviewEdge(edge) &&
          edge.source === sourceNodeId
      ).length;
      const position = {
        x: (sourceFlowNode?.position.x ?? 0) + 420,
        y: (sourceFlowNode?.position.y ?? 0) + existingPreviewCount * 60,
      };

      const previewNode: CanvasNodeUIData = {
        type: CanvasNodeKind.DesmosPreviewNode,
        data: {},
      };
      const previewEdgeId = edgeId ?? `edge-${sourceNodeId}-desmos-${Date.now()}`;
      const previewEdge: CanvasEdgeUIData = {
        source: sourceNodeId,
        target: previewNodeId,
        type: CanvasEdgeKind.DesmosPreviewEdge,
        data: { sourceOutputName },
      };

      // 预览节点的 flow 位置信息在此处按源节点动态生成。
      const previewFlowNode: CanvasNodeFlowData = {
        id: previewNodeId,
        type: CanvasNodeKind.DesmosPreviewNode,
        position,
        data: {},
      };
      const previewFlowEdge: CanvasEdgeFlowData = {
        id: previewEdgeId,
        source: previewEdge.source,
        target: previewEdge.target,
        type: previewEdge.type,
        data: {},
      };
      store.setState((state) => {
        const nextNodes = new Map(state.nodes);
        nextNodes.set(previewNodeId, {
          type: previewNode.type,
          data: previewNode.data,
        });
        const nextEdges = new Map(state.edges);
        nextEdges.set(previewEdgeId, previewEdge);
        return {
          nodes: nextNodes,
          edges: nextEdges,
          flowNodes: [...state.flowNodes, previewFlowNode],
          flowEdges: [...state.flowEdges, previewFlowEdge],
        };
      });
      return { nodeId: previewNodeId, edgeId: previewEdgeId };
    };

    const updateNodeControlValues = (nodeId: string, values: Record<string, unknown>) =>
      store.setState((state) => {
        const node = state.nodes.get(nodeId);
        if (!node || node.type !== CanvasNodeKind.TextNode || !node.data.controls) return state;
        const nextControls = (node.data.controls as Control[]).map((control) => {
          if (Object.prototype.hasOwnProperty.call(values, control.name)) {
            return { ...control, value: values[control.name] };
          }
          return control;
        });
        const nextNodes = new Map(state.nodes);
        nextNodes.set(nodeId, {
          ...node,
          data: {
            ...node.data,
            controls: nextControls,
          },
        });
        return { nodes: nextNodes };
      });

    const updateNodeControlValue = (nodeId: string, controlName: string, value: unknown) =>
      store.setState((state) => {
        const node = state.nodes.get(nodeId);
        if (!node || node.type !== CanvasNodeKind.TextNode || !node.data.controls) return state;
        const nextControls = (node.data.controls as Control[]).map((control) =>
          control.name === controlName ? { ...control, value } : control
        );
        const nextNodes = new Map(state.nodes);
        nextNodes.set(nodeId, {
          ...node,
          data: {
            ...node.data,
            controls: nextControls,
          },
        });
        return { nodes: nextNodes };
      });

    return {
      readUI: {
        getUISnapShot,
        useUIData,
        useNodeUIData,
        defaultTextNodeData,
      },
      readFlow: {
        getFlowSnapshot,
        useFlowData,
      },
      readCamera: {
        getCameraSnapshot,
        useCamera,
      },
      subscribe: {
        onData,
      },
      bridge: {
        connectEval,
      },
      writeUI: {
        updateNode,
        updateNodeData,
        updateNodeControlValues,
        updateNodeControlValue,
      },
      writeFlow: {
        handleFlowNodesChange,
        handleFlowEdgesChange,
      },
      writeCamera: {
        setCamera,
      },
      graph: {
        createDepEdge,
        createTextNode,
        createDesmosPreviewNode,
        removeNode,
        removeEdge,
        clearCanvas,
        resetToDefault,
      },
      porting: {
        exportUIData,
        exportFlowData,
        exportCanvasData,
        importCanvasData,
      },
    };
  }, [store]);

  return api;
};

