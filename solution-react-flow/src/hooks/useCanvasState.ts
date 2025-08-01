import { useCallback } from 'react';
import { NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { useCanvasStore } from '@/store/canvasStore';
import { Node } from '@/models/Node';
import { Edge } from '@/models/Edge';

/**
 * 画布状态管理 Hook
 * 提供统一的画布状态管理接口，简化组件使用
 */
export const useCanvasState = () => {
  const {
    nodes,
    edges,
    addNode,
    updateNode,
    removeNode,
    addEdge,
    updateEdge,
    removeEdge,
    setNodes,
    setEdges,
    clearCanvas,
    resetToDefault,
  } = useCanvasStore();

  // 便捷的节点操作
  const createNode = useCallback((nodeData: Omit<Node, 'id'>) => {
    const newNode: Node = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...nodeData,
    };
    addNode(newNode);
    return newNode;
  }, [addNode]);

  // 便捷的边操作
  const createEdge = useCallback((source: string, target: string, edgeData?: Partial<Edge>) => {
    const newEdge: Edge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source,
      target,
      type: 'custom',
      ...edgeData,
    };
    addEdge(newEdge);
    return newEdge;
  }, [addEdge]);

  // 批量导入数据
  const importCanvasData = useCallback((data: { nodes: Node[]; edges: Edge[] }) => {
    setNodes(data.nodes);
    setEdges(data.edges);
  }, [setNodes, setEdges]);

  // 导出数据
  const exportCanvasData = useCallback(() => {
    return { nodes, edges };
  }, [nodes, edges]);

  // React Flow 集成
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const updatedNodes = applyNodeChanges(changes, nodes) as Node[];
    setNodes(updatedNodes);
  }, [setNodes, nodes]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const updatedEdges = applyEdgeChanges(changes, edges) as Edge[];
    setEdges(updatedEdges);
  }, [setEdges, edges]);

  return {
    // 状态
    nodes,
    edges,
    
    // 节点操作
    addNode,
    updateNode,
    removeNode,
    createNode,
    
    // 边操作
    addEdge,
    updateEdge,
    removeEdge,
    createEdge,
    
    // 批量操作
    setNodes,
    setEdges,
    clearCanvas,
    resetToDefault,
    
    // React Flow 集成
    onNodesChange,
    onEdgesChange,
    
    // 导入导出
    importCanvasData,
    exportCanvasData,
  };
}; 