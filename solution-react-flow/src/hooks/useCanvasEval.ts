import { useCallback, useMemo, useRef, useState } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { jsExecutor, Control, ExecutionResult } from '@/services/jsExecutor';
import { produce } from 'immer';
import type { CanvasUIDataApi, UIData } from './useCanvasUIData';
import { TextNodeType } from '@/types/canvas';

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

export interface CanvasEvalDeltaNode {
  id: string;
  code: string;
  controls?: Control[];
}

export interface CanvasEvalDeltaEdge {
  source: string;
  target: string;
}

export interface CanvasEvalNode {
  code: string;
  isEvaluating: boolean;
  controls: Control[];
  outputs: Record<string, any>;
  logs: string[];
  errors: ErrorInfo[];
  warnings: WarningInfo[];
}

export type CanvasEvalNodes = Record<string, CanvasEvalNode>;

interface CanvasEvalStoreState {
  nodes: CanvasEvalNodes;
  incomingByTarget: Record<string, string[]>;
  outgoingBySource: Record<string, string[]>;
}

export interface CanvasEvalApi {
  // 订阅方法
  subscribeFromUI: (uiDataApi: CanvasUIDataApi) => () => void;
  subscribeData: (callback: (data: CanvasEvalNodes) => void) => () => void;

  // 数据访问方法
  getSnapshot: () => CanvasEvalNodes;
  useEvalStore: <T>(selector: (state: CanvasEvalNodes) => T) => T;

  // 计算控制方法
  evaluateNode: (nodeId: string) => Promise<void>;
  evaluateAll: () => Promise<void>;
}

/**
 * Conceptual Notes:
 * 
 * 我们这里自制 hooks 的设计是：
 * - 内部带状态（zustand store）；
 * - 返回一个集合多个函数/hook、可被解构使用的 api 对象；
 * - 并转介 zustand 的 subscribe 机制，暴露出 subscribeFrom{Otherside} 和 subscribeData 两个订阅方法。
 * 
 * 例如，在 Eval Hook 这一侧 subscribeFromUI 订阅 UI 数据变化，并调用 handleUIDataUpdate 处理 UI 数据更新；
 * handleUIDataUpdate 内调用 resolveDeltaByUIData 计算 delta，并判断有无与计算逻辑层有关的变更，并选择性调用 runEvaluationTask 触发计算；
 * 在 UI Hook 这一侧也类似如此。
 * 
 * 在这里，update 偏指订阅上游传下来的全量更新数据，是 "raw" 的；
 * 而 delta 更偏指订阅下游响应过程中根据不同数据源综合判断出来的、与本模块实际相关的"实际"变化；既是真正增量式的数据，也是本模块真正关心的变化。
 * 暂时可以认定一个原则：delta = diffAnalyze(otherside_update, local_state)
 * 而非之前采用的 delta = diffAnalyze(otherside_update, prev_otherside_update)
 * 
 */

// create initial node data
const createInitialNodeData = (code: string, controls: Control[]): CanvasEvalNode => ({
  code,
  isEvaluating: false,
  controls: controls.map((control) => ({ ...control })),
  outputs: {},
  logs: [],
  errors: [],
  warnings: [],
});

const mergeControls = (prevControls: Control[], nextControls: Control[]) => {
  const prevMap = new Map(prevControls.map((c) => [c.name, c]));
  return nextControls.map((control) => {
    const prev = prevMap.get(control.name);
    if (!prev) return control;
    return { ...control, value: control.value ?? prev.value ?? control.defaultValue };
  });
};

const buildGraphIOReprs = (edges: CanvasEvalDeltaEdge[]) => {
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
const createEdgeKey = ({ source, target }: CanvasEvalDeltaEdge) => `${source}->${target}`;

// 描述一次 CanvasEvalInput 变化中我们关心的增量信息
interface InputDelta {
  addedNodeIds: string[];
  removedNodeIds: string[];
  updatedNodeIds: string[];
  addedEdges: CanvasEvalDeltaEdge[];
  removedEdges: CanvasEvalDeltaEdge[];
  impactedNodeIds: string[];
  hasChanges: boolean;
}


// 从 lastCompletedState 中提取边信息，用于比较
const extractEdgesFromState = (state: CanvasEvalStoreState): CanvasEvalDeltaEdge[] => {
  const edges: CanvasEvalDeltaEdge[] = [];
  Object.entries(state.outgoingBySource).forEach(([source, targets]) => {
    targets.forEach((target) => {
      edges.push({ source, target });
    });
  });
  return edges;
};

// 计算 currentInput 与 lastCompletedState 之间的差异，并推断需要重新计算的节点集合
// 改为基于 lastCompletedState 而非历史 input 来比较，这样能捕获所有状态变化（包括通过 requestEvaluation 等触发的）
const resolveDeltaByUIData = (
  lastCompletedState: CanvasEvalStoreState | null,
  uiData: UIData,
): InputDelta => {

  // 如果没有上次完成的状态，则认为所有节点都是新增的
  if (!lastCompletedState) {
    const addedNodeIds = uiData.nodes.map((node) => node.id);
    const impactedNodeIds = addedNodeIds;
    return {
      addedNodeIds,
      removedNodeIds: [],
      updatedNodeIds: [],
      addedEdges: uiData.edges,
      removedEdges: [],
      impactedNodeIds,
      hasChanges: true,
    };
  }

  // 从 lastCompletedState 中提取节点和边信息
  const prevNodeMap = new Map(
    Object.entries(lastCompletedState.nodes)
      .map(([id, nodeData]) => [id, { id, code: nodeData.code, controls: nodeData.controls }])
  );
  const currNodeMap = new Map(uiData.nodes.map(node => [
    node.id,
    {
      id: node.id,
      code: node.type === 'textNode' ? node.data.code : '',
      controls: node.type === 'textNode' ? node.data.controls : []
    }
  ]));

  const addedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];

  // 逐一检查当前节点，识别新增与修改节点
  currNodeMap.forEach((currNode) => {
    const prevNode = prevNodeMap.get(currNode.id);
    if (!prevNode) {
      addedNodeIds.push(currNode.id);
      return;
    }
    // 检查 code 变化
    if (prevNode.code !== currNode.code) {
      updatedNodeIds.push(currNode.id);
      return;
    }
    // 检查 controls 变化
    const prevControlsMap = new Map(prevNode.controls.map(c => [c.name, c]));
    const currControlsMap = new Map(currNode.controls.map(c => [c.name, c]));

    currControlsMap.forEach((currControl) => {
      const prevControl = prevControlsMap.get(currControl.name);
      if (!prevControl
        || prevControl.defaultValue !== currControl.defaultValue
        || prevControl.type !== currControl.type
        || prevControl.value !== currControl.value
        || prevControl.min !== currControl.min
        || prevControl.max !== currControl.max
        || prevControl.step !== currControl.step
      ) {
        updatedNodeIds.push(currNode.id);
        return;
      }
    });

    prevControlsMap.forEach((prevControl) => {
      if (!currControlsMap.has(prevControl.name)) {
        updatedNodeIds.push(currNode.id);
        return;
      }
    });
  });

  // 找出已经不存在的节点
  prevNodeMap.forEach((_, nodeId) => {
    if (!currNodeMap.has(nodeId)) {
      removedNodeIds.push(nodeId);
    }
  });

  const prevEdges = extractEdgesFromState(lastCompletedState);
  const currEdges = uiData.edges;
  const prevEdgeSet = new Set(prevEdges.map(createEdgeKey));
  const currEdgeSet = new Set(uiData.edges.map(createEdgeKey));

  const addedEdges: CanvasEvalDeltaEdge[] = [];
  const removedEdges: CanvasEvalDeltaEdge[] = [];

  uiData.edges.forEach((edge) => {
    if (!prevEdgeSet.has(createEdgeKey(edge))) {
      addedEdges.push(edge);
    }
  });

  prevEdges.forEach((edge) => {
    if (!currEdgeSet.has(createEdgeKey(edge))) {
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
    const downstream = currEdges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
    downstream.forEach((targetId) => impacted.add(targetId));
  });

  // 仅保留当前图中实际存在的节点，避免无效计算
  // （removeEdges 等可能会向 impacted 添加不存在的节点，需要过滤掉）
  const currNodeIds = new Set(currNodeMap.keys());
  const impactedNodeIds = [...impacted].filter((id) => currNodeIds.has(id));

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

// 根据最新 UI 数据构建下一版 eval 数据(nodes) --- 全量更新版，用于首次运行
const createInitialEvalNodes = (
  uiData: UIData,
): CanvasEvalNodes => {
  const nextNodes: CanvasEvalNodes = {};

  uiData.nodes.forEach((node) => {
    if (node.type === 'textNode') {
      nextNodes[node.id] = createInitialNodeData(node.data.code, node.data.controls);
    } else {
      nextNodes[node.id] = createInitialNodeData('', []);
    }
  });

  return nextNodes;
};

// 根据最新 UI 数据构建下一版 eval 数据(nodes) --- 增量更新版，用于非初次运行
const buildNextEvalNodes = (
  currNodes: CanvasEvalNodes,
  currUIData: UIData,
  delta: InputDelta,
): CanvasEvalNodes =>
  produce(currNodes, (draft) => {
    delta.addedNodeIds.forEach((id) => {
      const node = currUIData.nodes.find((node) => node.id === id)! as TextNodeType;
      draft[id] = createInitialNodeData(node.data.code, node.data.controls);
    });

    delta.removedNodeIds.forEach((id) => {
      delete draft[id];
    });

    delta.updatedNodeIds.forEach((id) => {
      const node = currUIData.nodes.find((node) => node.id === id)! as TextNodeType;
      draft[id]!.code = node.data.code;
      draft[id]!.controls = node.data.controls.map((control) => ({ ...control }));
    });
  });

const collectEvaluationScope = (
  entryNodeIds: string[],
  state: CanvasEvalStoreState,
) => {
  const existingNodeIds = new Set(Object.keys(state.nodes));
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
  interimResults: Map<string, CanvasEvalNode>,
) => {
  const inputs: Record<string, any> = {};
  const sources = state.incomingByTarget[nodeId] || [];

  sources.forEach((sourceId) => {
    const sourceState = interimResults.get(sourceId) ?? state.nodes[sourceId];
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
  const interimResults = new Map<string, CanvasEvalNode>();

  for (const nodeId of plan.order) {
    if (latestVersionRef.current !== version) {
      return;
    }

    const nodeState = stateSnapshot.nodes[nodeId];
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
      nodes: {},
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
          draft.nodes[nodeId] = result;
        });
      });

      return nextState;
    }, []);

  // 处理 UI 数据更新的内部函数
  const handleUIDataUpdate = useCallback(
    async (uiData: UIData) => {

      evalTaskVerRef.current += 1;
      const currentVersion = evalTaskVerRef.current;

      const baseState = lastCompletedStateRef.current;

      // 基于 lastCompletedState 和 uiData 计算差异
      const delta = resolveDeltaByUIData(baseState, uiData);

      // 如果没有变化，直接恢复上次完成的状态
      if (!delta.hasChanges && baseState) {
        lastCompletedStateRef.current = baseState;
        store.setState(baseState);
        return;
      }

      // 构建下一个状态
      // 如果有 baseState，则进行增量更新；否则进行全量初始化
      const nextNodes = baseState
        ? buildNextEvalNodes(baseState.nodes, uiData, delta)
        : createInitialEvalNodes(uiData);

      const graphIOReprs = buildGraphIOReprs(uiData.edges);   // CanvasEdge extends CanvasEvalDeltaEdge, so it's compatible

      const nextState: CanvasEvalStoreState = {
        nodes: nextNodes,
        incomingByTarget: graphIOReprs.incoming,
        outgoingBySource: graphIOReprs.outgoing,
      };

      // 如果没有需要重新计算的节点，直接更新 lastCompletedState
      // 注意：下面每个结束条件中，lastCompletedState 一定要在 store.setState 之前更新，因为 store.setState 是**同步**的，会触发 UI 组件重新渲染，并可能回传到这里
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
    const getSnapshot = () => store.getState().nodes;

    const useEvalStore = <T>(selector: (state: CanvasEvalNodes) => T) =>
      useStore(store, (state) => selector(state.nodes));

    // 订阅来自 UI 的数据变化
    const subscribeFromUI = (uiDataApi: CanvasUIDataApi): (() => void) => {
      const unsubscribe = uiDataApi.subscribeData((uiData) => handleUIDataUpdate(uiData));
      return unsubscribe;
    };

    // 订阅 Eval 数据变化
    const subscribeData = (
      callback: (data: CanvasEvalNodes) => void
    ): (() => void) => {
      return store.subscribe((state) => {
        const currentData = state.nodes;
        callback(currentData);
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
      const ids = Object.keys(store.getState().nodes);
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
  }, [store, runEvaluationTask, handleUIDataUpdate]);

  return api;
};

