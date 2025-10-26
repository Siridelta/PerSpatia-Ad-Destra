import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { jsExecutor, ControlInfo, ExecutionResult } from '@/services/jsExecutor';
import { useCanvasStore } from '@/store/canvasStore';
import { usePrevious } from './usePrevious';

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

// 为边生成唯一键，便于在 diff 过程中进行集合对比
const edgeKey = ({ source, target }: CanvasEvalEdgeInput) => `${source}->${target}`;

// 描述一次 CanvasEvalInput 变化中我们关心的增量信息
interface CanvasDelta {
  addedNodeIds: string[];
  removedNodeIds: string[];
  updatedNodeIds: string[];
  addedEdges: CanvasEvalEdgeInput[];
  removedEdges: CanvasEvalEdgeInput[];
  impactedNodeIds: string[];
  hasChanges: boolean;
}

// 计算前后两次输入之间的差异，并推断需要重新计算的节点集合
const diffCanvasInput = (
  previous: CanvasEvalInput,
  current: CanvasEvalInput,
  prevState: EvalStoreState,
): CanvasDelta => {
  const prevNodeMap = new Map(previous.nodes.map((node) => [node.id, node]));
  const currentNodeMap = new Map(current.nodes.map((node) => [node.id, node]));

  const addedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];

  // 逐一检查当前节点，识别新增与修改节点
  current.nodes.forEach((node) => {
    const prev = prevNodeMap.get(node.id);
    if (!prev) {
      addedNodeIds.push(node.id);
      return;
    }
    if (prev.code !== node.code) {
      updatedNodeIds.push(node.id);
    }
  });

  // 找出已经不存在的节点
  previous.nodes.forEach((node) => {
    if (!currentNodeMap.has(node.id)) {
      removedNodeIds.push(node.id);
    }
  });

  const prevEdgeSet = new Set(previous.edges.map(edgeKey));
  const currentEdgeSet = new Set(current.edges.map(edgeKey));

  const addedEdges: CanvasEvalEdgeInput[] = [];
  const removedEdges: CanvasEvalEdgeInput[] = [];

  current.edges.forEach((edge) => {
    if (!prevEdgeSet.has(edgeKey(edge))) {
      addedEdges.push(edge);
    }
  });

  previous.edges.forEach((edge) => {
    if (!currentEdgeSet.has(edgeKey(edge))) {
      removedEdges.push(edge);
    }
  });

  // 汇总需要重新计算的节点集合
  const impacted = new Set<string>();

  addedNodeIds.forEach((id) => impacted.add(id));
  updatedNodeIds.forEach((id) => impacted.add(id));
  addedEdges.forEach((edge) => impacted.add(edge.target));
  removedEdges.forEach((edge) => impacted.add(edge.target));

  // 节点被移除时，其下游节点同样需要重新计算
  removedNodeIds.forEach((nodeId) => {
    const downstream = prevState.outgoingBySource[nodeId] || [];
    downstream.forEach((targetId) => impacted.add(targetId));
  });

  // 仅保留当前图中实际存在的节点，避免无效计算
  const currentNodeIds = new Set(current.nodes.map((node) => node.id));
  const impactedNodeIds = Array.from(impacted).filter((id) => currentNodeIds.has(id));

  const hasChanges =
    addedNodeIds.length > 0 ||
    removedNodeIds.length > 0 ||
    updatedNodeIds.length > 0 ||
    addedEdges.length > 0 ||
    removedEdges.length > 0;

  return {
    addedNodeIds,
    removedNodeIds,
    updatedNodeIds,
    addedEdges,
    removedEdges,
    impactedNodeIds,
    hasChanges,
  };
};

// 根据最新输入构建下一版 eval 数据，尽量复用已有状态
const buildNextEvalData = (
  snapshot: EvalStoreState,
  input: CanvasEvalInput,
  controlsCache: Record<string, ControlInfo[] | undefined>,
): CanvasEvalData => {
  const nextData: CanvasEvalData = {};

  input.nodes.forEach(({ id, code }) => {
    const prev = snapshot.data[id];
    const cachedControls = controlsCache[id];

    if (prev) {
      nextData[id] = {
        ...prev,
        code,
        controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : prev.controls,
      };
      return;
    }

    nextData[id] = {
      ...createInitialNodeState(code),
      controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : [],
    };
  });

  return nextData;
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

export const useCanvasEval = (input: CanvasEvalInput): CanvasEvalController => {
  const previousInput = usePrevious(input);
  const currentInput = input;

  // 内部 evaluation store（每个 Canvas 单独实例）
  const storeRef = useRef<ReturnType<typeof createEvalStore>>(null);
  if (!storeRef.current) {
    storeRef.current = createEvalStore(currentInput);
  }
  const store = storeRef.current;
  
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
    let cancelled = false;

    // 统一的同步入口：基于 delta 只评估受影响节点
    const runSyncAndEvaluate = async () => {
      const snapshot = store.getState();
      const nextInput = currentInput;

      const { controlsCache } = useCanvasStore.getState();

      // 初次运行时直接全量同步与计算
      if (!previousInput) {
        const nextData = buildNextEvalData(snapshot, nextInput, controlsCache);
        const maps = buildGraphMaps(nextInput.edges);

        store.setState({
          data: nextData,
          incomingByTarget: maps.incoming,
          outgoingBySource: maps.outgoing,
        });

        const allNodeIds = Object.keys(nextData);
        if (!allNodeIds.length) return;

        const visited = new Set<string>();
        for (const nodeId of allNodeIds) {
          if (cancelled) return;
          await evaluateNodeAndDownstream(nodeId, store.getState, store.setState, persistControls, visited);
        }
        return;
      }

      // 基于前后状态计算增量
      const delta = diffCanvasInput(previousInput, nextInput, snapshot);
      if (!delta.hasChanges) {
        return;
      }

      const nextData = buildNextEvalData(snapshot, nextInput, controlsCache);
      const maps = buildGraphMaps(nextInput.edges);

      store.setState({
        data: nextData,
        incomingByTarget: maps.incoming,
        outgoingBySource: maps.outgoing,
      });

      if (!delta.impactedNodeIds.length) {
        return;
      }

      const visited = new Set<string>();
      for (const nodeId of delta.impactedNodeIds) {
        if (cancelled) return;
        await evaluateNodeAndDownstream(nodeId, store.getState, store.setState, persistControls, visited);
      }
    };

    runSyncAndEvaluate();

    return () => {
      cancelled = true;
    };
  }, [store, previousInput, currentInput, persistControls]);

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

