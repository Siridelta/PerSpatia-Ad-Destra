import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { jsExecutor, ControlInfo, ExecutionResult } from '@/services/jsExecutor';
import { useCanvasStore } from '@/store/canvasStore';
import { produce } from 'immer';

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

export interface CanvasEvalInputNode {
  id: string;
  code: string;
}

export interface CanvasEvalInputEdge {
  source: string;
  target: string;
}

export interface CanvasEvalInput {
  nodes: CanvasEvalInputNode[];
  edges: CanvasEvalInputEdge[];
}

export interface CanvasEvalNodeData {
  code: string;
  isEvaluating: boolean;
  controls: ControlInfo[];
  outputs: Record<string, any>;
  logs: string[];
  errors: ErrorInfo[];
  warnings: WarningInfo[];
}

export type CanvasEvalData = Record<string, CanvasEvalNodeData>;

interface CanvasEvalStoreState {
  data: CanvasEvalData;
  incomingByTarget: Record<string, string[]>;
  outgoingBySource: Record<string, string[]>;
}

export interface CanvasEvalApi {
  getSnapshot: () => CanvasEvalData;
  useEvalStore: <T>(selector: (state: CanvasEvalData) => T) => T;
  syncGraph: (input: CanvasEvalInput) => Promise<void>;
  updateNodeControls: (nodeId: string, nextValues: Record<string, unknown>) => Promise<void>;
  evaluateNode: (nodeId: string) => Promise<void>;
  evaluateAll: () => Promise<void>;
}

const createInitialNodeData = (code: string): CanvasEvalNodeData => ({
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

const buildGraphIOReprs = (edges: CanvasEvalInputEdge[]) => {
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




// --- 增量更新解析相关 ---


// 为边生成唯一键，便于在 diff 过程中进行集合对比
const createEdgeKey = ({ source, target }: CanvasEvalInputEdge) => `${source}->${target}`;

// 描述一次 CanvasEvalInput 变化中我们关心的增量信息
interface InputDelta {
  addedNodeIds: string[];
  removedNodeIds: string[];
  updatedNodeIds: string[];
  addedEdges: CanvasEvalInputEdge[];
  removedEdges: CanvasEvalInputEdge[];
  impactedNodeIds: string[];
  hasChanges: boolean;
}

const cloneCanvasEvalInput = (input: CanvasEvalInput): CanvasEvalInput => ({
  nodes: input.nodes.map(({ id, code }) => ({ id, code })),
  edges: input.edges.map(({ source, target }) => ({ source, target })),
});

const cloneCanvasEvalStoreState = (state: CanvasEvalStoreState): CanvasEvalStoreState => ({
  data: Object.entries(state.data).reduce<CanvasEvalData>((acc, [nodeId, node]) => {
    acc[nodeId] = {
      code: node.code,
      isEvaluating: node.isEvaluating,
      controls: node.controls.map((control) => ({ ...control })),
      outputs: { ...node.outputs },
      logs: [...node.logs],
      errors: node.errors.map((error) => ({ ...error })),
      warnings: node.warnings.map((warning) => ({ ...warning })),
    };
    return acc;
  }, {}),
  incomingByTarget: Object.entries(state.incomingByTarget).reduce<Record<string, string[]>>(
    (acc, [targetId, sources]) => {
      acc[targetId] = [...sources];
      return acc;
    },
    {},
  ),
  outgoingBySource: Object.entries(state.outgoingBySource).reduce<Record<string, string[]>>(
    (acc, [sourceId, targets]) => {
      acc[sourceId] = [...targets];
      return acc;
    },
    {},
  ),
});

// 计算前后两次输入之间的差异，并推断需要重新计算的节点集合
// 须满足约束：当前边的 source 和 target 必须是 current 中实际存在的节点
const resolveInputDelta = (
  previous: CanvasEvalInput,
  current: CanvasEvalInput,
): InputDelta => {
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

  const prevEdgeSet = new Set(previous.edges.map(createEdgeKey));
  const currentEdgeSet = new Set(current.edges.map(createEdgeKey));

  const addedEdges: CanvasEvalInputEdge[] = [];
  const removedEdges: CanvasEvalInputEdge[] = [];

  current.edges.forEach((edge) => {
    if (!prevEdgeSet.has(createEdgeKey(edge))) {
      addedEdges.push(edge);
    }
  });

  previous.edges.forEach((edge) => {
    if (!currentEdgeSet.has(createEdgeKey(edge))) {
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
  // （兜底，以防输入数据不良，删除节点时没删除边而遗漏下游节点）
  removedNodeIds.forEach((nodeId) => {
    const downstream = current.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
    downstream.forEach((targetId) => impacted.add(targetId));
  });

  // 仅保留当前图中实际存在的节点，避免无效计算
  // （removeEdges 等可能会向 impacted 添加不存在的节点，需要过滤掉）
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

// 根据最新输入构建下一版 eval 数据 --- 全量更新版，用于首次运行
const createInitialEvalData = (
  currentInput: CanvasEvalInput,
  controlsCache: Record<string, ControlInfo[] | undefined>,
): CanvasEvalData => {
  const nextData: CanvasEvalData = {};

  currentInput.nodes.forEach(({ id, code }) => {
    const cachedControls = controlsCache[id];
    nextData[id] = {
      ...createInitialNodeData(code),
      controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : [],
    };
  });

  return nextData;
};

// 根据最新输入构建下一版 eval 数据 --- 增量更新版，用于非初次运行
const buildNextEvalData = (
  currentData: CanvasEvalData,
  currentInput: CanvasEvalInput,
  delta: InputDelta,
): CanvasEvalData =>
  produce(currentData, (draft) => {
    delta.addedNodeIds.forEach((id) => {
      draft[id] = createInitialNodeData(currentInput.nodes.find((node) => node.id === id)!.code);
    });

    delta.removedNodeIds.forEach((id) => {
      delete draft[id];
    });

    delta.updatedNodeIds.forEach((id) => {
      draft[id]!.code = currentInput.nodes.find((node) => node.id === id)!.code;
    });
  });

const collectEvaluationScope = (
  entryNodeIds: string[],
  state: CanvasEvalStoreState,
) => {
  const existingNodeIds = new Set(Object.keys(state.data));
  const scope = new Set<string>();
  const discoveryOrder: string[] = [];   // image of queue, sync operates with it, but without shifts
  const queue: string[] = [];

  entryNodeIds.forEach((nodeId) => {
    if (!existingNodeIds.has(nodeId)) return;
    if (scope.has(nodeId)) return;
    scope.add(nodeId);
    queue.push(nodeId);
    discoveryOrder.push(nodeId);
  });

  while (queue.length) {
    const current = queue.shift()!;
    const downstream = state.outgoingBySource[current] || [];
    downstream.forEach((targetId) => {
      if (!existingNodeIds.has(targetId)) return;
      if (scope.has(targetId)) return;
      scope.add(targetId);
      queue.push(targetId);
      discoveryOrder.push(targetId);
    });
  }

  return { scope, discoveryOrder };
};

// 目前暂时使用简单串行执行的计划方式
const createEvaluationPlan = (
  entryNodeIds: string[],
  state: CanvasEvalStoreState,
) => {
  const { scope, discoveryOrder } = collectEvaluationScope(entryNodeIds, state);
  if (!scope.size) {
    return { scope, order: [] as string[] };
  }

  // discoveryOrder 里保证：一个节点要么是 entry，要么前方出现至少一个它的 scope 内上游依赖节点
  // 但真正的执行顺序 (plan.order) 需要保证一个非 entry 节点前方出现它的所有 scope 内上游依赖节点，之后再执行它自己

  // 1. 寻找 scope 里入度为 0 的节点，加入队列；这不等于被选定为 entry 的节点范围，因为 entry 节点也可能有(scope 内的)入度
  const inDegree = new Map<string, number>();
  scope.forEach((nodeId) => {
    const incoming = state.incomingByTarget[nodeId] || [];
    let count = 0;
    incoming.forEach((sourceId) => {
      if (scope.has(sourceId)) count += 1;
    });
    inDegree.set(nodeId, count);
  });

  const queue: string[] = [];
  discoveryOrder.forEach((nodeId) => {
    if ((inDegree.get(nodeId) ?? 0) === 0) queue.push(nodeId);
  });

  // 2. 使用队列出/入循环，来构建一个能保证"计划里每个节点前方必出现它的所有 scope 内上游依赖节点"的执行顺序
  const order: string[] = [];
  const localInDegree = new Map(inDegree);
  while (queue.length) {
    const current = queue.shift()!;
    order.push(current);

    const downstream = state.outgoingBySource[current] || [];
    downstream.forEach((targetId) => {
      if (!scope.has(targetId)) return;
      const next = (localInDegree.get(targetId) ?? 0) - 1;
      localInDegree.set(targetId, next);
      if (next === 0) queue.push(targetId);
    });
  }

  if (order.length !== scope.size) {
    console.warn('[useCanvasEval] evaluation scope contains cycle, fallback to discovery order.', {
      entryNodeIds,
      scopeSize: scope.size,
    });
    return { scope, order: discoveryOrder };
  }

  return { scope, order };
};

const collectLatestInputValues = (
  nodeId: string,
  state: CanvasEvalStoreState,
  interimResults: Map<string, CanvasEvalNodeData>,
) => {
  const inputs: Record<string, any> = {};
  const sources = state.incomingByTarget[nodeId] || [];

  sources.forEach((sourceId) => {
    const sourceState = interimResults.get(sourceId) ?? state.data[sourceId];
    if (sourceState?.outputs) {
      Object.assign(inputs, sourceState.outputs);
    }
  });

  return inputs;
};

const runEvaluationPlan = async (
  plan: { scope: Set<string>; order: string[] },
  stateSnapshot: CanvasEvalStoreState,
  latestVersionRef: { current: number },
  version: number,
  onControlsPersist?: (nodeId: string, controls: ControlInfo[]) => void,
) => {
  const interimResults = new Map<string, CanvasEvalNodeData>();

  for (const nodeId of plan.order) {
    if (latestVersionRef.current !== version) {
      return;
    }

    const nodeState = stateSnapshot.data[nodeId];
    if (!nodeState) continue;

    const trimmedCode = nodeState.code.trim();
    if (!trimmedCode) {
      interimResults.set(nodeId, {
        ...nodeState,
        isEvaluating: false,
        outputs: {},
        logs: [],
        errors: [],
        warnings: [],
      });
      continue;
    }

    const upstreamInputs = collectLatestInputValues(nodeId, stateSnapshot, interimResults);
    const controlInputs = nodeState.controls.reduce<Record<string, any>>((acc, control) => {
      const value = control.value ?? control.defaultValue;
      if (value !== undefined) acc[control.name] = value;
      return acc;
    }, {});

    try {
      const result: ExecutionResult = await jsExecutor.executeCode(trimmedCode, {
        ...upstreamInputs,
        ...controlInputs,
      });

      if (result.success) {
        interimResults.set(nodeId, {
          ...nodeState,
          isEvaluating: false,
          controls: result.controls,
          outputs: result.outputs,
          logs: result.logs,
          errors: [],
          warnings: result.warnings || [],
        });
        onControlsPersist?.(nodeId, result.controls);
      } else {
        interimResults.set(nodeId, {
          ...nodeState,
          isEvaluating: false,
          controls: mergeControls(nodeState.controls, result.controls),
          outputs: {},
          logs: result.logs,
          errors: result.errors || [{ message: 'Unknown execution error' }],
          warnings: result.warnings || [],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      interimResults.set(nodeId, {
        ...nodeState,
        isEvaluating: false,
        errors: [{ message, stack: error instanceof Error ? error.stack : undefined }],
      });
    }
  }

  if (latestVersionRef.current !== version) {
    return;
  }

  return interimResults;
};

const createEvalStore = (input: CanvasEvalInput) => {
  const initialData: CanvasEvalData = {};
  input.nodes.forEach(({ id, code }) => {
    initialData[id] = createInitialNodeData(code);
  });

  const maps = buildGraphIOReprs(input.edges);

  return createStore<CanvasEvalStoreState>()(
    immer(() => ({
      data: initialData,
      incomingByTarget: maps.incoming,
      outgoingBySource: maps.outgoing,
    })),
  );
};
type EvalStore = ReturnType<typeof createEvalStore>;

export const useCanvasEval = (input: CanvasEvalInput): CanvasEvalApi => {
  const currentInput = input;

  // 内部 evaluation store（每个 Canvas 单独实例）
  const [store] = useState(() => createEvalStore(currentInput));

  const evaluationVersionRef = useRef(0);
  const lastCompletedInputRef = useRef<CanvasEvalInput | null>(null);
  const lastCompletedStateRef = useRef<CanvasEvalStoreState | null>(null);

  if (!lastCompletedStateRef.current) {
    lastCompletedStateRef.current = cloneCanvasEvalStoreState(store.getState());
  }

  // CanvasStore 中的 controls 缓存，用于尽量持久化 controls 状态
  const setNodeControlsCache = useCanvasStore((state) => state.setNodeControlsCache);
  const persistControls = useCallback(
    (nodeId: string, controls: ControlInfo[]) => {
      console.log('persistControls', nodeId, controls);
      setNodeControlsCache(nodeId, controls.length ? controls : undefined);
    },
    [setNodeControlsCache]
  );

  const runEvaluationTask = useCallback(
    async (
      entryNodeIds: string[],
      baseState: CanvasEvalStoreState,
      version: number,
    ): Promise<CanvasEvalStoreState | null> => {
      if (!entryNodeIds.length) {
        return null;
      }

      const plan = createEvaluationPlan(entryNodeIds, baseState);
      if (!plan.order.length) {
        return baseState;
      }

      const interimResults = await runEvaluationPlan(
        plan,
        baseState,
        evaluationVersionRef,
        version,
        persistControls,
      );

      if (!interimResults || evaluationVersionRef.current !== version) {
        return null;
      }

      const nextState = produce(baseState, (draft) => {
        interimResults.forEach((result, nodeId) => {
          draft.data[nodeId] = result;
        });
      });

      return nextState;
    },
    [persistControls],
  );

  useEffect(() => {
     evaluationVersionRef.current += 1;
     const currentVersion = evaluationVersionRef.current;
 
     const runSyncAndEvaluate = async () => {
       const currentStateSnapshot = store.getState();
       const { controlsCache } = useCanvasStore.getState();
       const baseInput = lastCompletedInputRef.current;
       const baseState = lastCompletedStateRef.current ?? currentStateSnapshot;
 
       if (baseInput) {
         const delta = resolveInputDelta(baseInput, currentInput);
         if (!delta.hasChanges) {
           const restoredState = cloneCanvasEvalStoreState(baseState);
           store.setState(restoredState);
           lastCompletedInputRef.current = cloneCanvasEvalInput(currentInput);
           lastCompletedStateRef.current = cloneCanvasEvalStoreState(restoredState);
           return;
         }
 
         const nextData = buildNextEvalData(baseState.data, currentInput, delta);
         const graphIOReprs = buildGraphIOReprs(currentInput.edges);
 
         const nextState: CanvasEvalStoreState = {
           data: nextData,
           incomingByTarget: graphIOReprs.incoming,
           outgoingBySource: graphIOReprs.outgoing,
         };
 
         store.setState(nextState);
 
         if (!delta.impactedNodeIds.length) {
           lastCompletedInputRef.current = cloneCanvasEvalInput(currentInput);
           lastCompletedStateRef.current = cloneCanvasEvalStoreState(nextState);
           return;
         }
 
         const completedState = await runEvaluationTask(delta.impactedNodeIds, nextState, currentVersion);
         if (completedState) {
           store.setState(completedState);
           lastCompletedInputRef.current = cloneCanvasEvalInput(currentInput);
           lastCompletedStateRef.current = cloneCanvasEvalStoreState(completedState);
         }
         return;
       }
 
       const nextData = createInitialEvalData(currentInput, controlsCache);
       const graphIOReprs = buildGraphIOReprs(currentInput.edges);
 
       const nextState: CanvasEvalStoreState = {
         data: nextData,
         incomingByTarget: graphIOReprs.incoming,
         outgoingBySource: graphIOReprs.outgoing,
       };
 
       store.setState(nextState);
 
       const allNodeIds = Object.keys(nextData);
       if (!allNodeIds.length) {
         lastCompletedInputRef.current = cloneCanvasEvalInput(currentInput);
         lastCompletedStateRef.current = cloneCanvasEvalStoreState(nextState);
         return;
       }
 
       const completedState = await runEvaluationTask(allNodeIds, nextState, currentVersion);
       if (completedState) {
         store.setState(completedState);
         lastCompletedInputRef.current = cloneCanvasEvalInput(currentInput);
         lastCompletedStateRef.current = cloneCanvasEvalStoreState(completedState);
       }
     };
 
     runSyncAndEvaluate();
   }, [store, currentInput, persistControls, runEvaluationTask]);

  const api = useMemo<CanvasEvalApi>(() => {
    const getSnapshot = () => store.getState().data;

    const useEvalStore = <T>(selector: (state: CanvasEvalData) => T) =>
      useStore(store, (state) => selector(state.data));

    const requestEvaluation = async (entryNodeIds: string[]) => {
      if (!entryNodeIds.length) return;

      evaluationVersionRef.current += 1;
      const currentVersion = evaluationVersionRef.current;

      const baseState = store.getState();
      const completedState = await runEvaluationTask(entryNodeIds, baseState, currentVersion);
      if (completedState) {
        store.setState(completedState);
        lastCompletedStateRef.current = cloneCanvasEvalStoreState(completedState);
      }
    };

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
        await requestEvaluation([nodeId]);
      } else {
        const current = store.getState().data[nodeId];
        if (current) persistControls(nodeId, current.controls);
      }
    };

    const evaluateNode = async (nodeId: string) => {
      await requestEvaluation([nodeId]);
    };

    const evaluateAll = async () => {
      const ids = Object.keys(store.getState().data);
      await requestEvaluation(ids);
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
            ...createInitialNodeData(code),
            controls: cachedControls ? cachedControls.map((control) => ({ ...control })) : [],
          };
        }
      });

      const maps = buildGraphIOReprs(nextInput.edges);

      store.setState({
        data: nextData,
        incomingByTarget: maps.incoming,
        outgoingBySource: maps.outgoing,
      });

      await requestEvaluation(Object.keys(nextData));
    };

    return {
      getSnapshot,
      useEvalStore,
      syncGraph,
      updateNodeControls,
      evaluateNode,
      evaluateAll,
    };
  }, [store, persistControls, runEvaluationTask]);

  return api;
};

