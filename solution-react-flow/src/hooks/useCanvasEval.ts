import { useEffect, useMemo, useRef } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { jsExecutor, ControlInfo, ExecutionResult } from '@/services/jsExecutor';

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
  getState: () => EvalStoreState,
  setState: (updater: (prev: EvalStoreState) => EvalStoreState) => void,
) => {
  const currentState = getState();
  const currentNode = currentState.data[nodeId];
  if (!currentNode) return;

  const code = currentNode.code.trim();

  if (!code) {
    setState((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        [nodeId]: {
          ...prev.data[nodeId],
          outputs: {},
          logs: [],
          errors: [],
          warnings: [],
        },
      },
    }));
    return;
  }

  if (currentNode.isEvaluating) return;

  setState((prev) => ({
    ...prev,
    data: {
      ...prev.data,
      [nodeId]: {
        ...prev.data[nodeId],
        isEvaluating: true,
      },
    },
  }));

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
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          [nodeId]: {
            ...prev.data[nodeId],
            isEvaluating: false,
            controls: mergeControls(prev.data[nodeId].controls, result.controls),
            outputs: result.outputs,
            logs: result.logs,
            errors: [],
            warnings: result.warnings || [],
          },
        },
      }));
    } else {
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          [nodeId]: {
            ...prev.data[nodeId],
            isEvaluating: false,
            controls: mergeControls(prev.data[nodeId].controls, result.controls),
            outputs: {},
            logs: result.logs,
            errors: result.errors || [{ message: 'Unknown execution error' }],
            warnings: result.warnings || [],
          },
        },
      }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        [nodeId]: {
          ...prev.data[nodeId],
          isEvaluating: false,
          errors: [{ message, stack: error instanceof Error ? error.stack : undefined }],
        },
      },
    }));
  }
};

const evaluateNodeAndDownstream = async (
  nodeId: string,
  getState: () => EvalStoreState,
  setState: (updater: (prev: EvalStoreState) => EvalStoreState) => void,
  visited: Set<string> = new Set(),
) => {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  await executeNode(nodeId, getState, setState);

  const downstream = getState().outgoingBySource[nodeId] || [];
  for (const targetId of downstream) {
    await evaluateNodeAndDownstream(targetId, getState, setState, visited);
  }
};

const createEvalStore = (input: CanvasEvalInput) => {
  const initialData: CanvasEvalData = {};
  input.nodes.forEach(({ id, code }) => {
    initialData[id] = createInitialNodeState(code);
  });

  const maps = buildGraphMaps(input.edges);

  return createStore<EvalStoreState>()(() => ({
    data: initialData,
    incomingByTarget: maps.incoming,
    outgoingBySource: maps.outgoing,
  }));
};

export const useCanvasEval = (input: CanvasEvalInput): CanvasEvalController => {

  //
  // 内部数据 store, 持久
  //
  const storeRef = useRef<ReturnType<typeof createEvalStore>>(null);

  if (!storeRef.current) {
    storeRef.current = createEvalStore(input);
  }

  const store = storeRef.current;

  useEffect(() => {
    const runSyncAndEvaluate = async () => {
      const snapshot = store.getState();
      const nextData: CanvasEvalData = {};

      input.nodes.forEach(({ id, code }) => {
        const prev = snapshot.data[id];
        nextData[id] = prev ? (prev.code === code ? prev : { ...prev, code }) : createInitialNodeState(code);
      });

      const maps = buildGraphMaps(input.edges);

      store.setState({
        data: nextData,
        incomingByTarget: maps.incoming,
        outgoingBySource: maps.outgoing,
      });

      const ids = Object.keys(store.getState().data);
      for (const nodeId of ids) {
        await evaluateNodeAndDownstream(nodeId, store.getState, (updater) => store.setState(updater));
      }
    };

    runSyncAndEvaluate();
  }, [store, input.nodes, input.edges]);

  const controller = useMemo<CanvasEvalController>(() => {
    const getSnapshot = () => store.getState().data;

    const useEvalStore = <T>(selector: (state: CanvasEvalData) => T) =>
      useStore(store, (state) => selector(state.data));

    const updateNodeControls = async (nodeId: string, nextValues: Record<string, unknown>) => {
      let changed = false;

      store.setState((prev) => {
        const node = prev.data[nodeId];
        if (!node) return prev;

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

        if (!changed) return prev;

        return {
          ...prev,
          data: {
            ...prev.data,
            [nodeId]: {
              ...node,
              controls: updatedControls,
            },
          },
        };
      });

      if (changed) {
        await evaluateNodeAndDownstream(nodeId, store.getState, (updater) => store.setState(updater));
      }
    };

    const evaluateNode = async (nodeId: string) => {
      await evaluateNodeAndDownstream(nodeId, store.getState, (updater) => store.setState(updater));
    };

    const evaluateAll = async () => {
      const ids = Object.keys(store.getState().data);
      for (const nodeId of ids) {
        await evaluateNode(nodeId);
      }
    };

    const syncGraph = async (nextInput: CanvasEvalInput) => {
      const current = store.getState();
      const nextData: CanvasEvalData = {};

      nextInput.nodes.forEach(({ id, code }) => {
        const prev = current.data[id];
        nextData[id] = prev ? (prev.code === code ? prev : { ...prev, code }) : createInitialNodeState(code);
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
  }, [store]);

  return controller;
};

