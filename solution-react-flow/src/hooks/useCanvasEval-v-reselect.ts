import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import { createSelector } from 'reselect';
import { jsExecutor, ControlInfo, ExecutionResult } from '@/services/jsExecutor';
import { useCanvasStore } from '@/store/canvasStore';

export interface ErrorInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface WarningInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface CanvasEvalNodeInput {
  id: string;
  code: string;
}

export interface CanvasEvalEdgeInput {
  source: string;
  target: string;
}

export interface CanvasEvalInput {
  nodes: CanvasEvalNodeInput[];
  edges: CanvasEvalEdgeInput[];
}

export interface CanvasNodeEvalState {
  code: string;
  isEvaluating: boolean;
  controls: ControlInfo[];
  outputs: Record<string, any>;
  logs: string[];
  errors: ErrorInfo[];
  warnings: WarningInfo[];
}

export type CanvasEvalData = Record<string, CanvasNodeEvalState>;

interface EvalStoreState {
  data: CanvasEvalData;
  incomingByTarget: Record<string, string[]>;
  outgoingBySource: Record<string, string[]>;
}

interface CanvasNodeUpdateDelta {
  prev: CanvasEvalNodeInput;
  next: CanvasEvalNodeInput;
}

interface CanvasGraphDelta {
  nodesAdded: CanvasEvalNodeInput[];
  nodesRemoved: CanvasEvalNodeInput[];
  nodesUpdated: CanvasNodeUpdateDelta[];
  edgesAdded: CanvasEvalEdgeInput[];
  edgesRemoved: CanvasEvalEdgeInput[];
  affectedNodeIds: string[];
  hasChanges: boolean;
}

export interface CanvasEvalController {
  getSnapshot: () => CanvasEvalData;
  useEvalStore: <T>(selector: (state: CanvasEvalData) => T) => T;
  syncGraph: (input: CanvasEvalInput) => Promise<void>;
  updateNodeControls: (nodeId: string, nextValues: Record<string, unknown>) => Promise<void>;
  evaluateNode: (nodeId: string) => Promise<void>;
  evaluateAll: () => Promise<void>;
}

const createInitialNodeState = (code: string): CanvasNodeEvalState => ({
  code,
  isEvaluating: false,
  controls: [],
  outputs: {},
  logs: [],
  errors: [],
  warnings: [],
});

const mergeControls = (prevControls: ControlInfo[], nextControls: ControlInfo[]) => {
  const prevMap = new Map(prevControls.map((c) => [c.name, c]));
  return nextControls.map((control) => {
    const prev = prevMap.get(control.name);
    if (!prev) return control;
    return { ...control, value: control.value ?? prev.value ?? control.defaultValue };
  });
};

const buildGraphMaps = (edges: CanvasEvalEdgeInput[]) => {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};

  edges.forEach(({ source, target }) => {
    if (!incoming[target]) incoming[target] = [];
    if (!incoming[target].includes(source)) incoming[target].push(source);

    if (!outgoing[source]) outgoing[source] = [];
    if (!outgoing[source].includes(target)) outgoing[source].push(target);
  });

  return { incoming, outgoing };
};

const collectInputValues = (nodeId: string, state: EvalStoreState) => {
  const inputs: Record<string, any> = {};
  const sources = state.incomingByTarget[nodeId] || [];

  sources.forEach((sourceId) => {
    const sourceState = state.data[sourceId];
    if (sourceState?.outputs) {
      Object.assign(inputs, sourceState.outputs);
    }
  });

  return inputs;
};

const executeNode = async (
  nodeId: string,
  getState: EvalStore['getState'],
  setState: EvalStore['setState'],
  onControlsPersist?: (nodeId: string, controls: ControlInfo[]) => void,
) => {
  const currentState = getState();
  const currentNode = currentState.data[nodeId];
  if (!currentNode) return;

  const code = currentNode.code.trim();

  if (!code) {
    setState((draft) => {
      const node = draft.data[nodeId];
      if (node) {
        node.outputs = {};
        node.logs = [];
        node.errors = [];
        node.warnings = [];
      }
    });
    return;
  }

  if (currentNode.isEvaluating) return;

  setState((draft) => {
    const node = draft.data[nodeId];
    if (node) {
      node.isEvaluating = true;
    }
  });

  try {
    const upstreamInputs = collectInputValues(nodeId, getState());
    const controlInputs = currentNode.controls.reduce<Record<string, any>>((acc, control) => {
      const value = control.value ?? control.defaultValue;
      if (value !== undefined) acc[control.name] = value;
      return acc;
    }, {});

    const result: ExecutionResult = await jsExecutor.executeCode(code, {
      ...upstreamInputs,
      ...controlInputs,
    });

    if (result.success) {
      setState((draft) => {
        const node = draft.data[nodeId];
        if (node) {
          node.isEvaluating = false;
          node.controls = result.controls;
          node.outputs = result.outputs;
          node.logs = result.logs;
          node.errors = [];
          node.warnings = result.warnings || [];
        }
      });
      onControlsPersist?.(nodeId, result.controls);
    } else {
      setState((draft) => {
        const node = draft.data[nodeId];
        if (node) {
          node.isEvaluating = false;
          node.controls = mergeControls(node.controls, result.controls);
          node.outputs = {};
          node.logs = result.logs;
          node.errors = result.errors || [{ message: 'Unknown execution error' }];
          node.warnings = result.warnings || [];
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState((draft) => {
      const node = draft.data[nodeId];
      if (node) {
        node.isEvaluating = false;
        node.errors = [{ message, stack: error instanceof Error ? error.stack : undefined }];
      }
    });
  }
};

const evaluateNodeAndDownstream = async (
  nodeId: string,
  getState: EvalStore['getState'],
  setState: EvalStore['setState'],
  onControlsPersist?: (nodeId: string, controls: ControlInfo[]) => void,
  visited: Set<string> = new Set(),
) => {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  await executeNode(nodeId, getState, setState, onControlsPersist);

  const downstream = getState().outgoingBySource[nodeId] || [];
  for (const targetId of downstream) {
    await evaluateNodeAndDownstream(targetId, getState, setState, onControlsPersist, visited);
  }
};

const createEvalStore = (input: CanvasEvalInput) => {
  const initialData: CanvasEvalData = {};
  input.nodes.forEach(({ id, code }) => {
    initialData[id] = createInitialNodeState(code);
  });

  const maps = buildGraphMaps(input.edges);

  return createStore<EvalStoreState>()(
    immer(() => ({
      data: initialData,
      incomingByTarget: maps.incoming,
      outgoingBySource: maps.outgoing,
    })),
  );
};
type EvalStore = ReturnType<typeof createEvalStore>;

const edgeKey = ({ source, target }: CanvasEvalEdgeInput) => `${source}->${target}`;

const calculateGraphDelta = (
  prev: Pick<CanvasEvalInput, 'nodes' | 'edges'>,
  next: Pick<CanvasEvalInput, 'nodes' | 'edges'>,
): CanvasGraphDelta => {
  const prevNodeMap = new Map(prev.nodes.map((node) => [node.id, node]));
  const nextNodeMap = new Map(next.nodes.map((node) => [node.id, node]));

  const nodesAdded: CanvasEvalNodeInput[] = [];
  const nodesRemoved: CanvasEvalNodeInput[] = [];
  const nodesUpdated: CanvasNodeUpdateDelta[] = [];

  next.nodes.forEach((node) => {
    const prevNode = prevNodeMap.get(node.id);
    if (!prevNode) {
      nodesAdded.push(node);
      return;
    }

    if (prevNode.code !== node.code) {
      nodesUpdated.push({ prev: prevNode, next: node });
    }
  });

  prev.nodes.forEach((node) => {
    if (!nextNodeMap.has(node.id)) {
      nodesRemoved.push(node);
    }
  });

  const prevEdgeMap = new Map(prev.edges.map((edge) => [edgeKey(edge), edge]));
  const nextEdgeMap = new Map(next.edges.map((edge) => [edgeKey(edge), edge]));

  const edgesAdded: CanvasEvalEdgeInput[] = [];
  const edgesRemoved: CanvasEvalEdgeInput[] = [];

  next.edges.forEach((edge) => {
    if (!prevEdgeMap.has(edgeKey(edge))) {
      edgesAdded.push(edge);
    }
  });

  prev.edges.forEach((edge) => {
    if (!nextEdgeMap.has(edgeKey(edge))) {
      edgesRemoved.push(edge);
    }
  });

  const affectedNodeIdsSet = new Set<string>();
  nodesAdded.forEach((node) => affectedNodeIdsSet.add(node.id));
  nodesUpdated.forEach(({ next: node }) => affectedNodeIdsSet.add(node.id));
  nodesRemoved.forEach((node) => affectedNodeIdsSet.add(node.id));
  edgesAdded.forEach((edge) => {
    affectedNodeIdsSet.add(edge.source);
    affectedNodeIdsSet.add(edge.target);
  });
  edgesRemoved.forEach((edge) => {
    affectedNodeIdsSet.add(edge.source);
    affectedNodeIdsSet.add(edge.target);
  });

  const hasChanges =
    nodesAdded.length > 0 ||
    nodesRemoved.length > 0 ||
    nodesUpdated.length > 0 ||
    edgesAdded.length > 0 ||
    edgesRemoved.length > 0;

  return {
    nodesAdded,
    nodesRemoved,
    nodesUpdated,
    edgesAdded,
    edgesRemoved,
    affectedNodeIds: Array.from(affectedNodeIdsSet),
    hasChanges,
  };
};

const selectCanvasInput = (input: CanvasEvalInput) => input;

const makeSelectCanvasDelta = () => {
  let prevNodes: CanvasEvalNodeInput[] = [];
  let prevEdges: CanvasEvalEdgeInput[] = [];

  return createSelector([selectCanvasInput], (nextInput) => {
    const delta = calculateGraphDelta(
      { nodes: prevNodes, edges: prevEdges },
      { nodes: nextInput.nodes, edges: nextInput.edges },
    );

    prevNodes = nextInput.nodes;
    prevEdges = nextInput.edges;

    return delta;
  });
};

export const useCanvasEval = (input: CanvasEvalInput): CanvasEvalController => {

  // 内部 evaluation store（每个 Canvas 单独实例）
  const storeRef = useRef<ReturnType<typeof createEvalStore>>(null);
  if (!storeRef.current) {
    storeRef.current = createEvalStore(input);
  }
  const store = storeRef.current;

  const selectDelta = useMemo(() => makeSelectCanvasDelta(), []);
  const delta = selectDelta(input);

  const latestInputRef = useRef(input);
  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);
  
  // CanvasStore 中的 controls 缓存，用于尽量持久化 controls 状态
  const setNodeControlsCache = useCanvasStore((state) => state.setNodeControlsCache);
  const persistControls = useCallback(
    (nodeId: string, controls: ControlInfo[]) => {
      console.log('persistControls', nodeId, controls);
      setNodeControlsCache(nodeId, controls.length ? controls : undefined);
    },
    [setNodeControlsCache]
  );

  useEffect(() => {
    if (!delta.hasChanges) {
      return;
    }

    // runSyncAndEvaluate
    // 1. 同步图结构和 node.code 数据
    // 2. 更新 controls cache
    // 3. 计算所有节点
    const runSyncAndEvaluate = async () => {
      const currentInput = latestInputRef.current;
      const snapshot = store.getState();
      const { controlsCache } = useCanvasStore.getState();
      const nextData: CanvasEvalData = {};

      currentInput.nodes.forEach(({ id, code }) => {
        const prev = snapshot.data[id];
        const cachedControls = controlsCache[id];

        if (prev) {
          nextData[id] = {
            ...prev,
            code,
            controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : prev.controls,
          };
        } else {
          nextData[id] = {
            ...createInitialNodeState(code),
            controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : [],
          };
        }
      });

      const maps = buildGraphMaps(currentInput.edges);

      store.setState({
        data: nextData,
        incomingByTarget: maps.incoming,
        outgoingBySource: maps.outgoing,
      });

      const ids = Object.keys(store.getState().data);
      for (const nodeId of ids) {
        await evaluateNodeAndDownstream(nodeId, store.getState, store.setState, persistControls);
      }
    };

    runSyncAndEvaluate();
  }, [store, persistControls, delta]);

  const controller = useMemo<CanvasEvalController>(() => {
    const getSnapshot = () => store.getState().data;

    const useEvalStore = <T>(selector: (state: CanvasEvalData) => T) =>
      useStore(store, (state) => selector(state.data));

    const updateNodeControls = async (nodeId: string, nextValues: Record<string, unknown>) => {
      let changed = false;

      store.setState((draft) => {
        const node = draft.data[nodeId];
        if (!node) return;

        const updatedControls = node.controls.map((control) => {
          if (Object.prototype.hasOwnProperty.call(nextValues, control.name)) {
            const nextValue = nextValues[control.name];
            if (control.value !== nextValue) {
              changed = true;
              return { ...control, value: nextValue };
            }
          }
          return control;
        });

        if (changed) {
          node.controls = updatedControls;
        }
      });

      if (changed) {
        await evaluateNodeAndDownstream(nodeId, store.getState, store.setState, persistControls);
      } else {
        const current = store.getState().data[nodeId];
        if (current) persistControls(nodeId, current.controls);
      }
    };

    const evaluateNode = async (nodeId: string) => {
      await evaluateNodeAndDownstream(nodeId, store.getState, store.setState, persistControls);
    };

    const evaluateAll = async () => {
      const ids = Object.keys(store.getState().data);
      for (const nodeId of ids) {
        await evaluateNode(nodeId);
      }
    };

    const syncGraph = async (nextInput: CanvasEvalInput) => {
      const current = store.getState();
      const { controlsCache } = useCanvasStore.getState();
      const nextData: CanvasEvalData = {};

      nextInput.nodes.forEach(({ id, code }) => {
        const prev = current.data[id];
        const cachedControls = controlsCache[id];
        if (prev) {
          nextData[id] = {
            ...prev,
            code,
            controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : prev.controls,
          };
        } else {
          nextData[id] = {
            ...createInitialNodeState(code),
            controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : [],
          };
        }
      });

      const maps = buildGraphMaps(nextInput.edges);

      store.setState({
        data: nextData,
        incomingByTarget: maps.incoming,
        outgoingBySource: maps.outgoing,
      });

      const ids = Object.keys(store.getState().data);
      for (const nodeId of ids) {
        await evaluateNode(nodeId);
      }
    };

    return {
      getSnapshot,
      useEvalStore,
      syncGraph,
      updateNodeControls,
      evaluateNode,
      evaluateAll,
    };
  }, [store, persistControls]);

  return controller;
};

