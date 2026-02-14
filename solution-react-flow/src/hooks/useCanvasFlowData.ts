import { useMemo, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type Viewport } from '@xyflow/react';
import { type CanvasEdgeUIDataEntry, type CanvasNodeUIDataEntry, type CanvasEdgeFlowData, type CanvasNodeFlowData, CanvasNodeKind, CanvasEdgeKind } from '@/types/canvas';
import defaultCanvas from '@/components/Canvas/defaultCanvas';

export interface FlowData {
  nodes: CanvasNodeFlowData[];
  edges: CanvasEdgeFlowData[];
  viewport: Viewport;
}

export interface CanvasFlowDataApi {
  getSnapshot: () => FlowData;
  useFlowData: <T>(selector: (data: FlowData) => T) => T;

  setNodes: (nodes: CanvasNodeFlowData[]) => void;
  setEdges: (edges: CanvasEdgeFlowData[]) => void;
  setViewport: (viewport: Viewport) => void;

  addNode: (node: CanvasNodeFlowData) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: CanvasEdgeFlowData) => void;
  removeEdge: (id: string) => void;

  handleNodesChange: (changes: NodeChange[]) => void;
  handleEdgesChange: (changes: EdgeChange[]) => void;

  importFlowData: (flowData: Partial<FlowData>) => void;
  exportFlowData: () => FlowData;
  resetToDefault: () => void;
  clearCanvas: () => void;

  syncWithUI: (uiNodes: CanvasNodeUIDataEntry[], uiEdges: CanvasEdgeUIDataEntry[]) => void;
}

const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_EPSILON = 0.0001;

const isSameViewport = (a: Viewport, b: Viewport) => (
  Math.abs(a.x - b.x) < VIEWPORT_EPSILON &&
  Math.abs(a.y - b.y) < VIEWPORT_EPSILON &&
  Math.abs(a.zoom - b.zoom) < VIEWPORT_EPSILON
);

const normalizeFlowNodes = (nodes: any[]): CanvasNodeFlowData[] =>
  nodes.map((node) => ({
    id: String(node.id),
    type: node?.type === CanvasNodeKind.DesmosPreviewNode ? CanvasNodeKind.DesmosPreviewNode : CanvasNodeKind.TextNode,
    position: node?.position ?? { x: 0, y: 0 },
    data: {},
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
    }));

const getDefaultFlowData = (): FlowData => {
  return {
    nodes: normalizeFlowNodes(defaultCanvas.flowData.nodes),
    edges: normalizeFlowEdges(defaultCanvas.flowData.edges),
    viewport: defaultCanvas.flowData.viewport,
  };
};

interface FlowStoreState {
  nodes: CanvasNodeFlowData[];
  edges: CanvasEdgeFlowData[];
  viewport: Viewport;
}

const createFlowStore = (initial?: Partial<FlowData>) =>
  createStore<FlowStoreState>()(() => ({
    nodes: initial?.nodes ?? getDefaultFlowData().nodes,
    edges: initial?.edges ?? getDefaultFlowData().edges,
    viewport: initial?.viewport ?? getDefaultFlowData().viewport,
  }));

const toFlowData = (state: FlowStoreState): FlowData => ({
  nodes: state.nodes,
  edges: state.edges,
  viewport: state.viewport,
});

export const useCanvasFlowData = (): CanvasFlowDataApi => {
  const [store] = useState(() => createFlowStore());

  return useMemo<CanvasFlowDataApi>(() => {
    const getSnapshot = () => toFlowData(store.getState());

    // We need to keep flowData stable as long as the store state is not changed
    const useFlowData = <T,>(selector: (data: FlowData) => T): T => {
      const prevStateRef = useRef<FlowStoreState>(store.getState());
      const prevDataRef = useRef<FlowData>(toFlowData(prevStateRef.current));
      return useStore(store, (state): T => {
        if (prevStateRef.current !== state) {
          prevStateRef.current = state;
          prevDataRef.current = toFlowData(state);
        }
        return selector(prevDataRef.current);
      });
    }

    const setNodes = (nodes: CanvasNodeFlowData[]) => store.setState({ nodes });
    const setEdges = (edges: CanvasEdgeFlowData[]) => store.setState({ edges });
    const setViewport = (viewport: Viewport) =>
      store.setState((state) => (isSameViewport(state.viewport, viewport) ? state : { viewport }));

    const addNode = (node: CanvasNodeFlowData) =>
      store.setState((state) => ({ nodes: [...state.nodes, node] }));

    const removeNode = (id: string) =>
      store.setState((state) => ({
        nodes: state.nodes.filter((node) => node.id !== id),
        edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      }));

    const addEdge = (edge: CanvasEdgeFlowData) =>
      store.setState((state) => ({ edges: [...state.edges, edge] }));

    const removeEdge = (id: string) =>
      store.setState((state) => ({ edges: state.edges.filter((edge) => edge.id !== id) }));

    const handleNodesChange = (changes: NodeChange[]) =>
      store.setState((state) => ({
        nodes: applyNodeChanges(changes, state.nodes) as CanvasNodeFlowData[],
      }));

    const handleEdgesChange = (changes: EdgeChange[]) =>
      store.setState((state) => ({
        edges: applyEdgeChanges(changes, state.edges) as CanvasEdgeFlowData[],
      }));

    const importFlowData = (incoming: Partial<FlowData>) => {
      console.log('importFlowData ', new Date().toISOString(), ', viewport x:', incoming.viewport?.x);
      store.setState((state) => ({
        nodes: normalizeFlowNodes((incoming.nodes as any[]) ?? state.nodes),
        edges: normalizeFlowEdges((incoming.edges as any[]) ?? state.edges),
        viewport: incoming.viewport ?? state.viewport,
      }));
    };

    const exportFlowData = () => toFlowData(store.getState());

    const resetToDefault = () => store.setState(getDefaultFlowData());
    const clearCanvas = () => store.setState({ nodes: [], edges: [], viewport: defaultViewport });

    const syncWithUI = (uiNodes: CanvasNodeUIDataEntry[], uiEdges: CanvasEdgeUIDataEntry[]) => {
      store.setState((state) => {
        const existingNodeMap = new Map(state.nodes.map((node) => [node.id, node]));
        const existingEdgeMap = new Map(state.edges.map((edge) => [edge.id, edge]));

        const nextNodes: CanvasNodeFlowData[] = uiNodes.map((uiNode) => {
          const existing = existingNodeMap.get(uiNode.id);
          if (existing) {
            return { ...existing, type: uiNode.type, data: {} };
          }
          return {
            id: uiNode.id,
            type: uiNode.type,
            position: { x: 0, y: 0 },
            data: {},
          };
        });

        const nodeIdSet = new Set(nextNodes.map((node) => node.id));
        const nextEdges: CanvasEdgeFlowData[] = uiEdges
          .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
          .map((uiEdge) => {
            const existing = existingEdgeMap.get(uiEdge.id);
            if (existing) {
              return { ...existing, type: uiEdge.type, source: uiEdge.source, target: uiEdge.target, data: {} };
            }
            return {
              id: uiEdge.id,
              source: uiEdge.source,
              target: uiEdge.target,
              type: uiEdge.type,
              data: {},
            };
          });

        return {
          nodes: nextNodes,
          edges: nextEdges,
        };
      });
    };

    return {
      getSnapshot,
      useFlowData,
      setNodes,
      setEdges,
      setViewport,
      addNode,
      removeNode,
      addEdge,
      removeEdge,
      handleNodesChange,
      handleEdgesChange,
      importFlowData,
      exportFlowData,
      resetToDefault,
      clearCanvas,
      syncWithUI,
    };
  }, [store]);
};

