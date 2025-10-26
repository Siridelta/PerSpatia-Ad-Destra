import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Store } from 'jotai';
import { atom, createStore as createJotaiStore } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector';
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

const mergeControls = (prevControls: ControlInfo[], nextControls?: ControlInfo[]) => {
  const prevMap = new Map(prevControls.map((control) => [control.name, control]));
  const nextList = nextControls ?? [];
  return nextList.map((control) => {
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

const allNodeIdsAtom = atom<string[]>([]);
const incomingByTargetAtom = atom<Record<string, string[]>>({});
const outgoingBySourceAtom = atom<Record<string, string[]>>({});
// 每个节点使用 atomFamily 独立存储，确保依赖追踪粒度控制在节点级别
const nodeStateFamily = atomFamily<string, CanvasNodeEvalState>(() => atom(createInitialNodeState('')));

// 聚合视图，供外部 selector 方便地读取全量的节点执行结果
const evalDataAtom = atom((get) => {
  const ids = get(allNodeIdsAtom);
  const data: CanvasEvalData = {};
  ids.forEach((id) => {
    data[id] = get(nodeStateFamily(id));
  });
  return data;
});

const cloneControls = (controls?: ControlInfo[]) => {
  if (!controls || controls.length === 0) return [] as ControlInfo[];
  return controls.map((control) => ({ ...control }));
};

const areControlsEqual = (prev: ControlInfo[], next: ControlInfo[]) => {
  if (prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    const a = prev[index];
    const b = next[index];
    if (a.name !== b.name) return false;
    if (a.value !== b.value) return false;
  }
  return true;
};

const areStringListsEqual = (prev?: string[], next?: string[]) => {
  if (!prev && !next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  const sortedPrev = [...prev].sort();
  const sortedNext = [...next].sort();
  for (let index = 0; index < sortedPrev.length; index += 1) {
    if (sortedPrev[index] !== sortedNext[index]) return false;
  }
  return true;
};

const collectInputValues = (store: Store, nodeId: string) => {
  const inputs: Record<string, any> = {};
  const sources = store.get(incomingByTargetAtom)[nodeId] || [];
  sources.forEach((sourceId) => {
    const sourceState = store.get(nodeStateFamily(sourceId));
    if (sourceState?.outputs) {
      Object.assign(inputs, sourceState.outputs);
    }
  });
  return inputs;
};

// 先执行当前节点，再递归处理其所有下游节点，实现按需的增量更新
const executeNode = async (
  store: Store,
  nodeId: string,
  persistControls?: (id: string, controls: ControlInfo[]) => void,
  isCancelled?: () => boolean,
) => {
  const nodeAtom = nodeStateFamily(nodeId);
  const current = store.get(nodeAtom);
  if (!current) return;

  const trimmedCode = current.code.trim();
  if (!trimmedCode) {
    const cleared: CanvasNodeEvalState = {
      ...current,
      isEvaluating: false,
      outputs: {},
      logs: [],
      errors: [],
      warnings: [],
    };
    store.set(nodeAtom, cleared);
    return;
  }

  if (current.isEvaluating) return;

  store.set(nodeAtom, { ...current, isEvaluating: true });

  try {
    const upstreamInputs = collectInputValues(store, nodeId);
    const controlInputs = current.controls.reduce<Record<string, any>>((acc, control) => {
      const value = control.value ?? control.defaultValue;
      if (value !== undefined) acc[control.name] = value;
      return acc;
    }, {});

    const result: ExecutionResult = await jsExecutor.executeCode(trimmedCode, {
      ...upstreamInputs,
      ...controlInputs,
    });

    if (isCancelled?.()) return;

    const latest = store.get(nodeAtom) ?? current;

    if (result.success) {
      const nextControls = result.controls ?? latest.controls;
      const nextState: CanvasNodeEvalState = {
        ...latest,
        isEvaluating: false,
        controls: nextControls,
        outputs: result.outputs,
        logs: result.logs,
        errors: [],
        warnings: result.warnings || [],
      };
      store.set(nodeAtom, nextState);
      persistControls?.(nodeId, nextControls);
    } else {
      const mergedControls = mergeControls(latest.controls, result.controls);
      const nextState: CanvasNodeEvalState = {
        ...latest,
        isEvaluating: false,
        controls: mergedControls,
        outputs: {},
        logs: result.logs,
        errors: result.errors || [{ message: 'Unknown execution error' }],
        warnings: result.warnings || [],
      };
      store.set(nodeAtom, nextState);
    }
  } catch (error) {
    if (isCancelled?.()) return;
    const latest = store.get(nodeAtom) ?? current;
    const message = error instanceof Error ? error.message : String(error);
    const nextState: CanvasNodeEvalState = {
      ...latest,
      isEvaluating: false,
      errors: [{ message, stack: error instanceof Error ? error.stack : undefined }],
    };
    store.set(nodeAtom, nextState);
  }
};

// 先执行当前节点，再递归处理其所有下游节点，实现按需的增量更新
const evaluateNodeAndDownstream = async (
  store: Store,
  nodeId: string,
  persistControls?: (id: string, controls: ControlInfo[]) => void,
  visited: Set<string> = new Set(),
  isCancelled?: () => boolean,
) => {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  await executeNode(store, nodeId, persistControls, isCancelled);
  if (isCancelled?.()) return;

  const downstream = store.get(outgoingBySourceAtom)[nodeId] || [];
  for (const targetId of downstream) {
    await evaluateNodeAndDownstream(store, targetId, persistControls, visited, isCancelled);
    if (isCancelled?.()) return;
  }
};

// 批量执行一组脏节点，自动去重并保证每个节点只执行一次
const evaluateNodesBatch = async (
  store: Store,
  dirtyNodeIds: Set<string>,
  persistControls?: (id: string, controls: ControlInfo[]) => void,
  isCancelled?: () => boolean,
) => {
  if (!dirtyNodeIds.size) return;
  const visited = new Set<string>();
  for (const nodeId of dirtyNodeIds) {
    if (isCancelled?.()) return;
    await evaluateNodeAndDownstream(store, nodeId, persistControls, visited, isCancelled);
  }
};

// 将 React Flow 提供的图数据同步到 Jotai store，并返回需要重新计算的节点集合
const syncGraphState = (
  store: Store,
  input: CanvasEvalInput,
  controlsCache: Record<string, ControlInfo[]>,
) => {
  const dirtyNodeIds = new Set<string>();

  const prevIds = store.get(allNodeIdsAtom);
  const prevStates = new Map<string, CanvasNodeEvalState>();
  prevIds.forEach((id) => {
    const state = store.get(nodeStateFamily(id));
    if (state) prevStates.set(id, state);
  });

  const nextIds = input.nodes.map((node) => node.id);
  store.set(allNodeIdsAtom, nextIds);

  const nextIdSet = new Set(nextIds);
  prevIds.forEach((id) => {
    if (!nextIdSet.has(id)) {
      nodeStateFamily.remove(id);
    }
  });

  input.nodes.forEach(({ id, code }) => {
    const nodeAtom = nodeStateFamily(id);
    const prevState = prevStates.get(id);
    const cachedControls = controlsCache[id];

    if (!prevState) {
      const baseState = createInitialNodeState(code);
      baseState.controls = cachedControls ? cloneControls(cachedControls) : [];
      store.set(nodeAtom, baseState);
      dirtyNodeIds.add(id);
      return;
    }

    const nextControls = cachedControls ? cloneControls(cachedControls) : prevState.controls;
    const controlsChanged = cachedControls ? !areControlsEqual(prevState.controls, cachedControls) : false;
    const codeChanged = prevState.code !== code;

    if (codeChanged || controlsChanged) {
      const nextState: CanvasNodeEvalState = {
        ...prevState,
        code,
        controls: nextControls,
      };
      store.set(nodeAtom, nextState);
      dirtyNodeIds.add(id);
      return;
    }

    if (cachedControls && nextControls !== prevState.controls) {
      store.set(nodeAtom, { ...prevState, controls: nextControls });
    } else if (codeChanged) {
      store.set(nodeAtom, { ...prevState, code });
    }
  });

  const previousIncoming = store.get(incomingByTargetAtom);
  const { incoming, outgoing } = buildGraphMaps(input.edges);
  store.set(incomingByTargetAtom, incoming);
  store.set(outgoingBySourceAtom, outgoing);

  const targets = new Set<string>([...Object.keys(previousIncoming), ...Object.keys(incoming)]);
  targets.forEach((targetId) => {
    if (!areStringListsEqual(previousIncoming[targetId], incoming[targetId])) {
      dirtyNodeIds.add(targetId);
    }
  });

  return dirtyNodeIds;
};

export const useCanvasEval = (input: CanvasEvalInput): CanvasEvalController => {
  const storeRef = useRef<Store | null>(null);
  if (!storeRef.current) {
    const store = createJotaiStore();
    const initialIds = input.nodes.map((node) => node.id);
    store.set(allNodeIdsAtom, initialIds);
    const { incoming, outgoing } = buildGraphMaps(input.edges);
    store.set(incomingByTargetAtom, incoming);
    store.set(outgoingBySourceAtom, outgoing);
    input.nodes.forEach(({ id, code }) => {
      store.set(nodeStateFamily(id), createInitialNodeState(code));
    });
    storeRef.current = store;
  }
  const store = storeRef.current;

  const setNodeControlsCache = useCanvasStore((state) => state.setNodeControlsCache);
  const persistControls = useCallback(
    (nodeId: string, controls: ControlInfo[]) => {
      setNodeControlsCache(nodeId, controls.length ? controls : undefined);
    },
    [setNodeControlsCache],
  );

  useEffect(() => {
    let cancelled = false;

    const syncAndEvaluate = async () => {
      const { controlsCache } = useCanvasStore.getState();
      const dirty = syncGraphState(store, input, controlsCache);
      await evaluateNodesBatch(store, dirty, persistControls, () => cancelled);
    };

    syncAndEvaluate();

    return () => {
      cancelled = true;
    };
  }, [store, input, persistControls]);

  const controller = useMemo<CanvasEvalController>(() => {
    const getSnapshot = () => store.get(evalDataAtom);

    // 使用 useSyncExternalStoreWithSelector，确保订阅粒度与 selector 对齐
    const useEvalStore = <T>(selector: (state: CanvasEvalData) => T) => {
      return useSyncExternalStoreWithSelector(
        (listener) => store.sub(evalDataAtom, listener),
        () => store.get(evalDataAtom),
        () => store.get(evalDataAtom),
        selector,
        Object.is,
      );
    };

    const updateNodeControls = async (nodeId: string, nextValues: Record<string, unknown>) => {
      const nodeAtom = nodeStateFamily(nodeId);
      const current = store.get(nodeAtom);
      if (!current) return;

      let changed = false;
      const updatedControls = current.controls.map((control) => {
        if (Object.prototype.hasOwnProperty.call(nextValues, control.name)) {
          const nextValue = nextValues[control.name];
          if (control.value !== nextValue) {
            changed = true;
            return { ...control, value: nextValue };
          }
        }
        return control;
      });

      if (!changed) {
        persistControls(nodeId, current.controls);
        return;
      }

      store.set(nodeAtom, { ...current, controls: updatedControls });
      await evaluateNodeAndDownstream(store, nodeId, persistControls);
    };

    const evaluateNode = async (nodeId: string) => {
      await evaluateNodeAndDownstream(store, nodeId, persistControls);
    };

    // 主动触发全量执行，主要提供调试和兜底能力
    const evaluateAll = async () => {
      const ids = store.get(allNodeIdsAtom);
      await evaluateNodesBatch(store, new Set(ids), persistControls);
    };

    const syncGraph = async (nextInput: CanvasEvalInput) => {
      const { controlsCache } = useCanvasStore.getState();
      const dirty = syncGraphState(store, nextInput, controlsCache);
      await evaluateNodesBatch(store, dirty, persistControls);
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

