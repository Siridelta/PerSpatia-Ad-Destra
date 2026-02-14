import { useMemo, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { CanvasEvalApi } from './useCanvasEval';
import type {
  CanvasNodeUIDataEntry,
  CanvasEdgeUIDataEntry,
  TextNodeUIDataEntry,
  DesmosPreviewNodeUIDataEntry,
  DesmosPreviewEdgeUIDataEntry,
  CustomEdgeUIDataEntry,
} from '@/types/canvas';
import type { Control } from '@/services/jsExecutor';
import { DesmosPreviewNodeUIData, TextNodeUIData } from '@/types/nodeData';
import defaultCanvas from '@/components/Canvas/defaultCanvas';
import { immer } from 'zustand/middleware/immer';

export interface UIStoreState {
  nodes: CanvasNodeUIDataEntry[];
  edges: CanvasEdgeUIDataEntry[];
}

export interface UIData {
  nodes: CanvasNodeUIDataEntry[];
  edges: CanvasEdgeUIDataEntry[];
}

export interface CanvasUIDataApi {
  subscribeFromEval: (evalApi: CanvasEvalApi) => () => void;
  subscribeData: (callback: (data: UIData) => void) => () => void;
  getSnapshot: () => UIData;
  useUIData: <T>(selector: (data: UIData) => T) => T;
  useNodeData: (id: string) => TextNodeUIData | DesmosPreviewNodeUIData | undefined;
  addNode: <NodeType extends CanvasNodeUIDataEntry>(node: NodeType) => void;
  updateNode: <NodeType extends CanvasNodeUIDataEntry>(id: string, updates: Partial<NodeType>) => void;
  updateNodeData: (id: string, updates: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  setNodes: (nodes: CanvasNodeUIDataEntry[]) => void;

  addEdge: <EdgeType extends CanvasEdgeUIDataEntry>(edge: EdgeType) => void;
  updateEdge: <EdgeType extends CanvasEdgeUIDataEntry>(id: string, updates: Partial<EdgeType>) => void;
  removeEdge: (id: string) => void;
  setEdges: (edges: CanvasEdgeUIDataEntry[]) => void;
  clearCanvas: () => void;
  resetToDefault: () => void;
  importUIData: (data: { nodes: any[]; edges: any[] }) => void;
  exportUIData: () => UIData;

  createDepEdge: (source: string, target: string, edgeData?: Partial<CustomEdgeUIDataEntry>) => CustomEdgeUIDataEntry;
  defaultTextNodeData: TextNodeUIData;
  createTextNode: (params?: { id?: string; position?: { x: number; y: number }; data?: Partial<TextNodeUIData> }) => TextNodeUIDataEntry;
  createDesmosPreviewNode: (params: { sourceNodeId: string; sourceOutputName: string }) => void;

  updateNodeControlValues: (nodeId: string, values: Record<string, unknown>) => void;
  updateNodeControlValue: (nodeId: string, controlName: string, value: unknown) => void;
}

const isDesmosPreviewEdge = (edge: CanvasEdgeUIDataEntry): edge is DesmosPreviewEdgeUIDataEntry => edge.type === 'desmosPreviewEdge';

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

const normalizeUINodes = (nodes: any[]): CanvasNodeUIDataEntry[] =>
  nodes.map((node) => {
    if (node?.type === 'desmosPreviewNode') {
      return {
        id: String(node.id),
        type: 'desmosPreviewNode',
        data: (node?.data ?? {}) as DesmosPreviewNodeUIData,
      };
    }

    return {
      id: String(node.id),
      type: 'textNode',
      data: { ...defaultTextNodeData, ...(node?.data ?? {}) },
    };
  });

const normalizeUIEdges = (edges: any[]): CanvasEdgeUIDataEntry[] =>
  edges
    .filter((edge) => edge?.id && edge?.source && edge?.target)
    .map((edge) => {
      if (edge.type === 'desmosPreviewEdge') {
        return {
          id: String(edge.id),
          source: String(edge.source),
          target: String(edge.target),
          type: 'desmosPreviewEdge',
          data: {
            sourceOutputName: String(edge?.data?.sourceOutputName ?? ''),
          },
        };
      }

      return {
        id: String(edge.id),
        source: String(edge.source),
        target: String(edge.target),
        type: 'custom',
        data: (edge?.data ?? {}) as Record<string, unknown>,
      };
    });

const legacyDefaultNodes = (defaultCanvas as any)?.nodes ?? [];
const legacyDefaultEdges = (defaultCanvas as any)?.edges ?? [];

const getDefaultUIData = (): UIData => ({
  nodes: normalizeUINodes(legacyDefaultNodes),
  edges: normalizeUIEdges(legacyDefaultEdges),
});

const createUIStore = (initial?: { nodes: CanvasNodeUIDataEntry[]; edges: CanvasEdgeUIDataEntry[] }) =>
  createStore<UIStoreState>()(
    immer(() => ({
      nodes: initial?.nodes ?? getDefaultUIData().nodes,
      edges: initial?.edges ?? getDefaultUIData().edges,
    }))
  );

const toUIData = (state: UIStoreState): UIData => ({
  nodes: state.nodes,
  edges: state.edges,
});

interface EvalDataDelta {
  updatedControls: Record<string, Control[]>;
  hasChanges: boolean;
}

const resolveDeltaByEvalData = (
  currentEvalData: Record<string, { controls: Control[] }>,
  prevState?: UIStoreState
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
    if (hasChanges) updatedControls[nodeId] = currentControls;
  });

  prevState.nodes.forEach((node) => {
    if (node.type === 'textNode' && !currentEvalData[node.id]) {
      updatedControls[node.id] = [];
    }
  });

  return { updatedControls, hasChanges: Object.keys(updatedControls).length > 0 };
};

export const useCanvasUIData = (): CanvasUIDataApi => {
  const [store] = useState(() => createUIStore());

  const api = useMemo<CanvasUIDataApi>(() => {
    const subscribeFromEval = (evalApi: CanvasEvalApi): (() => void) => {
      const unsubscribe = evalApi.subscribeData(async (evalData) => {
        const currNodesControls: Record<string, { controls: Control[] }> = {};
        Object.entries(evalData).forEach(([nodeId, nodeData]) => {
          currNodesControls[nodeId] = { controls: nodeData.controls || [] };
        });

        const delta = resolveDeltaByEvalData(currNodesControls, store.getState());
        if (!delta.hasChanges) return;

        store.setState((draft) => {
          Object.entries(delta.updatedControls).forEach(([nodeId, controls]) => {
            const node = draft.nodes.find((n) => n.id === nodeId);
            if (!node || node.type !== 'textNode') return;
            node.data.controls = controls;
          });
        });
      });
      return unsubscribe;
    };

    const subscribeData = (callback: (data: UIData) => void): (() => void) =>
      store.subscribe((state) => callback(toUIData(state)));

    const getSnapshot = (): UIData => toUIData(store.getState());

    // We need to keep uiData stable as long as the store state is not changed
    const useUIData = <T,>(selector: (data: UIData) => T): T => {
      const prevStateRef = useRef<UIStoreState>(store.getState());
      const prevDataRef = useRef<UIData>(toUIData(prevStateRef.current));
      return useStore(store, (state): T => {
        if (prevStateRef.current !== state) {
          prevStateRef.current = state;
          prevDataRef.current = toUIData(state);
        }
        return selector(prevDataRef.current);
      });
    }

    const useNodeData = (id: string): TextNodeUIData | DesmosPreviewNodeUIData | undefined =>
      useUIData((data) => data.nodes.find((node) => node.id === id)?.data);

    const addNode = <NodeType extends CanvasNodeUIDataEntry>(node: NodeType) => {
      store.setState((state) => ({ nodes: [...state.nodes, node] }));
    };

    const updateNode = <NodeType extends CanvasNodeUIDataEntry>(id: string, updates: Partial<NodeType>) =>
      store.setState((state) => {
        const index = state.nodes.findIndex((node) => node.id === id);
        if (index === -1) return;
        state.nodes[index] = { ...state.nodes[index], ...updates } as CanvasNodeUIDataEntry;
      });

    const updateNodeData = (id: string, updates: Record<string, unknown>) =>
      store.setState((state) => {
        const node = state.nodes.find((n) => n.id === id);
        if (!node) return;
        node.data = { ...node.data, ...updates };
      });

    const removeNode = (id: string) => {
      const nodesToRemove = new Set<string>([id]);
      const snapshot = store.getState();
      const targetNode = snapshot.nodes.find((node) => node.id === id);

      if (targetNode?.type === 'textNode') {
        snapshot.edges.forEach((edge) => {
          if (isDesmosPreviewEdge(edge) && edge.source === id) {
            nodesToRemove.add(edge.target);
          }
        });
      }

      store.setState((state) => {
        state.nodes = state.nodes.filter((node) => !nodesToRemove.has(node.id));
        state.edges = state.edges.filter((edge) => !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target));
      });
    };

    const setNodes = (nodes: CanvasNodeUIDataEntry[]) => {
      store.setState({ nodes });
    };

    const addEdge = <EdgeType extends CanvasEdgeUIDataEntry>(edge: EdgeType) => {
      store.setState((state) => ({ edges: [...state.edges, edge] }));
    };

    const updateEdge = <EdgeType extends CanvasEdgeUIDataEntry>(id: string, updates: Partial<EdgeType>) =>
      store.setState((state) => {
        const index = state.edges.findIndex((edge) => edge.id === id);
        if (index === -1) return;
        Object.assign(state.edges[index], updates);
      });

    const removeEdge = (id: string) => {
      store.setState((state) => ({ edges: state.edges.filter((edge) => edge.id !== id) }));
    };

    const setEdges = (edges: CanvasEdgeUIDataEntry[]) => {
      store.setState({ edges });
    };

    const clearCanvas = () => {
      store.setState({ nodes: [], edges: [] });
    };

    const resetToDefault = () => {
      const defaultUI = getDefaultUIData();
      store.setState(defaultUI);
    };

    const importUIData = (data: { nodes: any[]; edges: any[] }) => {
      store.setState({
        nodes: normalizeUINodes(data.nodes ?? []),
        edges: normalizeUIEdges(data.edges ?? []),
      });
    };

    const exportUIData = (): UIData => toUIData(store.getState());

    const createDepEdge = (source: string, target: string, edgeData?: Partial<CustomEdgeUIDataEntry>) => {
      const newEdge: CustomEdgeUIDataEntry = {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        source,
        target,
        type: 'custom',
        data: edgeData?.data ?? {},
        ...edgeData,
      };
      addEdge(newEdge);
      return newEdge;
    };

    const createTextNode = (params?: { id?: string; position?: { x: number; y: number }; data?: Partial<TextNodeUIData> }) => {
      const nodeId = params?.id ?? `node-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const uiNode: TextNodeUIDataEntry = {
        id: nodeId,
        type: 'textNode',
        data: { ...defaultTextNodeData, ...(params?.data ?? {}) },
      };
      addNode(uiNode);
      return uiNode;
    };

    const createDesmosPreviewNode = ({ sourceNodeId, sourceOutputName }: {
      sourceNodeId: string;
      sourceOutputName: string;
    }) => {
      const snapshot = store.getState();
      const duplicatedEdge = snapshot.edges.some(
        (edge) =>
          isDesmosPreviewEdge(edge) &&
          edge.source === sourceNodeId &&
          edge.data?.sourceOutputName === sourceOutputName,
      );
      if (duplicatedEdge) return;

      const previewNodeId = `desmos-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const previewNode: DesmosPreviewNodeUIDataEntry = {
        id: previewNodeId,
        type: 'desmosPreviewNode',
        data: {},
      };
      const previewEdge: DesmosPreviewEdgeUIDataEntry = {
        id: `edge-${sourceNodeId}-desmos-${Date.now()}`,
        source: sourceNodeId,
        target: previewNodeId,
        type: 'desmosPreviewEdge',
        data: { sourceOutputName },
      };

      addNode(previewNode);
      addEdge(previewEdge);
    };

    const updateNodeControlValues = (nodeId: string, values: Record<string, unknown>) =>
      store.setState((state) => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== 'textNode' || !node.data.controls) return;
        node.data.controls.forEach((control) => {
          if (Object.prototype.hasOwnProperty.call(values, control.name)) {
            control.value = values[control.name];
          }
        });
      });

    const updateNodeControlValue = (nodeId: string, controlName: string, value: unknown) =>
      store.setState((state) => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== 'textNode' || !node.data.controls) return;
        const control = node.data.controls.find((item) => item.name === controlName);
        if (!control) return;
        control.value = value;
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
      clearCanvas,
      resetToDefault,
      importUIData,
      exportUIData,
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

