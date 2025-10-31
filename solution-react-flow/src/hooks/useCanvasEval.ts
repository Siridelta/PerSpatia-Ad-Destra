import { useCallback, useMemo, useRef, useState } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { jsExecutor, NodeControls, ExecutionResult } from '@/services/jsExecutor';
import { produce } from 'immer';
import type { CanvasUIDataApi } from './useCanvasUIData';

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
  controls?: NodeControls[];
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
  controls: NodeControls[];
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
  // 订阅方法
  subscribeFromUI: (uiDataApi: CanvasUIDataApi) => () => void;
  subscribeData: (callback: (data: CanvasEvalData, prevData?: CanvasEvalData) => void) => () => void;

  // 数据访问方法
  getSnapshot: () => CanvasEvalData;
  useEvalStore: <T>(selector: (state: CanvasEvalData) => T) => T;

  // 计算控制方法
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

const mergeControls = (prevControls: NodeControls[], nextControls: NodeControls[]) => {
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

// const cloneCanvasEvalStoreState = (state: CanvasEvalStoreState): CanvasEvalStoreState => ({
//   data: Object.entries(state.data).reduce<CanvasEvalData>((acc, [nodeId, node]) => {
//     acc[nodeId] = {
//       code: node.code,
//       isEvaluating: node.isEvaluating,
//       controls: node.controls.map((control) => ({ ...control })),
//       outputs: { ...node.outputs },
//       logs: [...node.logs],
//       errors: node.errors.map((error) => ({ ...error })),
//       warnings: node.warnings.map((warning) => ({ ...warning })),
//     };
//     return acc;
//   }, {}),
//   incomingByTarget: Object.entries(state.incomingByTarget).reduce<Record<string, string[]>>(
//     (acc, [targetId, sources]) => {
//       acc[targetId] = [...sources];
//       return acc;
//     },
//     {},
//   ),
//   outgoingBySource: Object.entries(state.outgoingBySource).reduce<Record<string, string[]>>(
//     (acc, [sourceId, targets]) => {
//       acc[sourceId] = [...targets];
//       return acc;
//     },
//     {},
//   ),
// });

// 从 lastCompletedState 中提取边信息，用于比较
const extractEdgesFromState = (state: CanvasEvalStoreState): CanvasEvalInputEdge[] => {
  const edges: CanvasEvalInputEdge[] = [];
  Object.entries(state.outgoingBySource).forEach(([source, targets]) => {
    targets.forEach((target) => {
      edges.push({ source, target });
    });
  });
  return edges;
};

// 计算 currentInput 与 lastCompletedState 之间的差异，并推断需要重新计算的节点集合
// 改为基于 lastCompletedState 而非历史 input 来比较，这样能捕获所有状态变化（包括通过 requestEvaluation 等触发的）
const resolveInputDelta = (
  lastCompletedState: CanvasEvalStoreState | null,
  currentInput: CanvasEvalInput,
): InputDelta => {
  // 如果没有上次完成的状态，则认为所有节点都是新增的
  if (!lastCompletedState) {
    const addedNodeIds = currentInput.nodes.map((node) => node.id);
    const impactedNodeIds = addedNodeIds;
    return {
      addedNodeIds,
      removedNodeIds: [],
      updatedNodeIds: [],
      addedEdges: currentInput.edges,
      removedEdges: [],
      impactedNodeIds,
      hasChanges: true,
    };
  }

  // 从 lastCompletedState 中提取节点和边信息
  const prevNodeMap = new Map(
    Object.entries(lastCompletedState.data).map(([id, nodeData]) => [id, { id, code: nodeData.code }])
  );
  const prevEdges = extractEdgesFromState(lastCompletedState);
  const currentNodeMap = new Map(currentInput.nodes.map((node) => [node.id, node]));

  const addedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];

  // 逐一检查当前节点，识别新增与修改节点
  currentInput.nodes.forEach((node) => {
    const prev = prevNodeMap.get(node.id);
    if (!prev) {
      addedNodeIds.push(node.id);
      return;
    }
    // 检查 code 或 controls 是否有变化
    if (prev.code !== node.code) {
      updatedNodeIds.push(node.id);
    } else if (node.controls) {
      // 检查 controls 值是否有变化
      const prevNodeData = lastCompletedState.data[node.id];
      if (prevNodeData) {
        const prevControls = prevNodeData.controls || [];
        const currentControls = node.controls || [];

        // 创建 control 值的映射，便于比较
        const prevValuesMap = new Map(prevControls.map(c => [c.name, c.value]));
        const currentValuesMap = new Map(currentControls.map(c => [c.name, c.value]));

        // 检查是否有值的变化
        let hasValueChange = false;

        // 检查当前 controls 是否有值变化
        for (const [name, value] of currentValuesMap.entries()) {
          if (prevValuesMap.get(name) !== value) {
            hasValueChange = true;
            break;
          }
        }

        // 如果 prevControls 中有 control 在当前 controls 中不存在，也算变化
        if (!hasValueChange) {
          for (const [name] of prevValuesMap.entries()) {
            if (!currentValuesMap.has(name)) {
              hasValueChange = true;
              break;
            }
          }
        }

        if (hasValueChange) {
          updatedNodeIds.push(node.id);
        }
      }
    }
  });

  // 找出已经不存在的节点
  prevNodeMap.forEach((_, nodeId) => {
    if (!currentNodeMap.has(nodeId)) {
      removedNodeIds.push(nodeId);
    }
  });

  const prevEdgeSet = new Set(prevEdges.map(createEdgeKey));
  const currentEdgeSet = new Set(currentInput.edges.map(createEdgeKey));

  const addedEdges: CanvasEvalInputEdge[] = [];
  const removedEdges: CanvasEvalInputEdge[] = [];

  currentInput.edges.forEach((edge) => {
    if (!prevEdgeSet.has(createEdgeKey(edge))) {
      addedEdges.push(edge);
    }
  });

  prevEdges.forEach((edge) => {
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
    const downstream = currentInput.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
    downstream.forEach((targetId) => impacted.add(targetId));
  });

  // 仅保留当前图中实际存在的节点，避免无效计算
  // （removeEdges 等可能会向 impacted 添加不存在的节点，需要过滤掉）
  const currentNodeIds = new Set(currentInput.nodes.map((node) => node.id));
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
): CanvasEvalData => {
  const nextData: CanvasEvalData = {};

  currentInput.nodes.forEach(({ id, code, controls }) => {
    nextData[id] = {
      ...createInitialNodeData(code),
      controls: controls ? controls.map((control) => ({ ...control })) : [],
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
      const node = currentInput.nodes.find((node) => node.id === id)!;
      draft[id] = {
        ...createInitialNodeData(node.code),
        controls: node.controls ? node.controls.map((control) => ({ ...control })) : [],
      };
    });

    delta.removedNodeIds.forEach((id) => {
      delete draft[id];
    });

    delta.updatedNodeIds.forEach((id) => {
      const node = currentInput.nodes.find((node) => node.id === id)!;
      draft[id]!.code = node.code;
      // 如果节点有新的 controls，合并它们（保留用户设置的值）
      if (node.controls) {
        draft[id]!.controls = mergeControls(draft[id]!.controls, node.controls);
      }
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

const createEvalStore = () => {
  return createStore<CanvasEvalStoreState>()(
    immer(() => ({
      data: {},
      incomingByTarget: {},
      outgoingBySource: {},
    })),
  );
};

export const useCanvasEval = (): CanvasEvalApi => {
  // 内部 evaluation store（每个 Canvas 单独实例）
  const [store] = useState(() => createEvalStore());

  const evalTaskVerRef = useRef(0);
  const lastCompletedStateRef = useRef<CanvasEvalStoreState | null>(null);

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
        evalTaskVerRef,
        version
      );

      if (!interimResults || evalTaskVerRef.current !== version) {
        return null;
      }

      const nextState = produce(baseState, (draft) => {
        interimResults.forEach((result, nodeId) => {
          draft.data[nodeId] = result;
        });
      });

      return nextState;
    }, []);

  // 同步 UI 数据并触发计算的内部函数
  const syncFromUIInput = useCallback(
    async (currentInput: CanvasEvalInput) => {
      evalTaskVerRef.current += 1;
      const currentVersion = evalTaskVerRef.current;

      const baseState = lastCompletedStateRef.current;

      // 基于 lastCompletedState 和 currentInput 计算差异
      const delta = resolveInputDelta(baseState, currentInput);

      // 如果没有变化，直接恢复上次完成的状态
      if (!delta.hasChanges && baseState) {
        lastCompletedStateRef.current = baseState;
        store.setState(baseState);
        return;
      }

      // 构建下一个状态
      // 如果有 baseState，则进行增量更新；否则进行全量初始化
      const nextData = baseState
        ? buildNextEvalData(baseState.data, currentInput, delta)
        : createInitialEvalData(currentInput);

      const graphIOReprs = buildGraphIOReprs(currentInput.edges);

      const nextState: CanvasEvalStoreState = {
        data: nextData,
        incomingByTarget: graphIOReprs.incoming,
        outgoingBySource: graphIOReprs.outgoing,
      };

      // 如果没有需要重新计算的节点，直接更新 lastCompletedState
      // lastCompletedState 一定要在 store.setState 之前更新，因为 store.setState 是**同步**的，会触发 UI 组件重新渲染，并可能回传到这里
      // 如果 lastCompletedState 没有及时更新，则 delta 无法计算为空，导致继续计算，无限循环
      if (!delta.impactedNodeIds.length) {
        lastCompletedStateRef.current = nextState;
        store.setState(nextState);
        return;
      }

      // 执行计算任务
      const completedState = await runEvaluationTask(delta.impactedNodeIds, nextState, currentVersion);
      if (completedState) {
        lastCompletedStateRef.current = completedState;
        store.setState(completedState);
      }
    },
    [store, runEvaluationTask]
  );

  const api = useMemo<CanvasEvalApi>(() => {
    const getSnapshot = () => store.getState().data;

    const useEvalStore = <T>(selector: (state: CanvasEvalData) => T) =>
      useStore(store, (state) => selector(state.data));

    // 订阅来自 UI 的数据变化
    const subscribeFromUI = (uiDataApi: CanvasUIDataApi): (() => void) => {

      // 订阅 UI 数据变化
      const unsubscribe = uiDataApi.subscribeData((uiData) => {
        // 转换 UI 数据为 EvalInput，从节点数据中读取 controls
        const currentInput: CanvasEvalInput = {
          nodes: uiData.nodes.map((node) => {
            let controls: NodeControls[] | undefined = undefined;
            if (node.type === 'textNode' && node.data.controls) {
              controls = node.data.controls.map((control) => ({ ...control }));
            }
            return {
              id: node.id,
              code: typeof node.data?.code === 'string' ? node.data.code : '',
              controls,
            };
          }),
          edges: uiData.edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
          })),
        };

        // 同步并触发计算
        syncFromUIInput(currentInput);
      });

      return unsubscribe;
    };

    // 订阅 Eval 数据变化
    const subscribeData = (
      callback: (data: CanvasEvalData, prevData?: CanvasEvalData) => void
    ): (() => void) => {
      return store.subscribe((state, prevState) => {
        const currentData = state.data;
        const prevData = prevState?.data ?? undefined;
        callback(currentData, prevData);
      });
    };

    const requestEvaluation = async (entryNodeIds: string[]) => {
      if (!entryNodeIds.length) return;

      evalTaskVerRef.current += 1;
      const currentVersion = evalTaskVerRef.current;

      const baseState = store.getState();
      const completedState = await runEvaluationTask(entryNodeIds, baseState, currentVersion);
      if (completedState) {
        lastCompletedStateRef.current = completedState;
        store.setState(completedState);
      }
    };

    const evaluateNode = async (nodeId: string) => {
      await requestEvaluation([nodeId]);
    };

    const evaluateAll = async () => {
      const ids = Object.keys(store.getState().data);
      await requestEvaluation(ids);
    };

    return {
      subscribeFromUI,
      subscribeData,
      getSnapshot,
      useEvalStore,
      evaluateNode,
      evaluateAll,
    };
  }, [store, runEvaluationTask, syncFromUIInput]);

  return api;
};

