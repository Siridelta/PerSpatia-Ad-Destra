import React, { useState, useCallback } from 'react';
import { ReactFlow, Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges, Connection, addEdge, useNodesState, useEdgesState, NodeTypes, EdgeTypes, Controls, Background, BackgroundVariant, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TextNode from '../TextNode';
import FloatingEdge from '../CustomEdge';
import Toolbar from '../Toolbar';
import './styles.css';
import { useToolStore } from '../../store/toolStore';
import CustomConnectionLine from './CustomConnectionLine';

// 注册自定义节点类型
const nodeTypes = {
  textNode: TextNode,
};

// 注册自定义边类型
const edgeTypes: EdgeTypes = {
  custom: FloatingEdge,
};

const initialNodes: Node[] = [
  { id: '1', position: { x: 250, y: 5 }, data: { label: 'function add(a, b) {\n  return a + b;\n}', result: '结果: add(2, 3) = 5' }, type: 'textNode' },
  { id: '2', position: { x: 100, y: 100 }, data: { label: 'const x = 10;\nconst y = 20;', result: 'x = 10, y = 20' }, type: 'textNode' },
  { id: '3', position: { x: 400, y: 100 }, data: { label: 'console.log("Hello World");', result: 'Hello World' }, type: 'textNode' },
  { id: '4', position: { x: 250, y: 200 }, data: { label: 'const arr = [1, 2, 3];\narr.map(x => x * 2);', result: '[2, 4, 6]' }, type: 'textNode' },
  { id: '5', position: { x: 100, y: 300 }, data: { label: 'const obj = {\n  name: "John",\n  age: 30\n};', result: '{name: "John", age: 30}' }, type: 'textNode' },
  { id: '6', position: { x: 400, y: 300 }, data: { label: 'function multiply(a, b) {\n  return a * b;\n}', result: '结果: multiply(4, 5) = 20' }, type: 'textNode' },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, type: 'custom' },
  { id: 'e1-3', source: '1', target: '3', animated: true, type: 'custom' },
  { id: 'e2-4', source: '2', target: '4', type: 'custom' },
  { id: 'e3-4', source: '3', target: '4', type: 'custom' },
  { id: 'e4-5', source: '4', target: '5', animated: true, type: 'custom' },
  { id: 'e4-6', source: '4', target: '6', animated: true, type: 'custom' },
  { id: 'e5-6', source: '5', target: '6', type: 'custom' }
];

const Canvas: React.FC = () => {
  // 使用 useNodesState 和 useEdgesState 替代 useState
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // 当前活动工具（全局）
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  
  // 连接模式的状态
  const [connectionStartNode, setConnectionStartNode] = useState<string | null>(null);
  
  // ReactFlow 实例引用
  const { screenToFlowPosition } = useReactFlow();

  // 复用的创建新节点函数
  const createTextNode = useCallback((position: { x: number; y: number }) => ({
    id: `node-${Date.now()}`,
    type: 'textNode',
    position,
    data: { label: '', initialEditing: true },
  }), []);

  // 处理连接完成
  const onConnect = useCallback(
    (connection: Connection) => {
      // 创建一个新的边，使用自定义边类型
      setEdges((eds) => addEdge({ ...connection, type: 'custom' }, eds));
    },
    [setEdges]
  );

  // 选择模式下双击空白处创建节点
  const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'select') {
      if ((event.target as HTMLElement).closest('.react-flow__node') || (event.target as HTMLElement).closest('.react-flow__edge')) {
        return;
      }
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setNodes((nds) => [...nds, createTextNode(position)]);
    }
  }, [activeTool, setNodes, createTextNode, screenToFlowPosition]);

  // 处理画布点击，用于取消连接或创建新节点
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'text') {
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setNodes((nds) => [...nds, createTextNode(position)]);
      setActiveTool('select');
      return;
    }
    if (connectionStartNode) {
      setConnectionStartNode(null);
    }
  }, [activeTool, setNodes, connectionStartNode, createTextNode, screenToFlowPosition]);

  return (
    <div className={`canvas-container${activeTool === 'text' ? ' text-mode' : ''}`}
      style={{ cursor: activeTool === 'text' ? 'text' : undefined }}
    >
      {/* 全局 marker 定义，所有边和连接线复用 */}
      <svg style={{ height: 0 }}>
        <defs>
          <marker
            id="custom-edge-arrow"
            markerWidth="20"
            markerHeight="20"
            refX="10"
            refY="10"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polyline points="5,6 10,10 5,14" fill="none" stroke='rgb(88, 88, 88)' strokeWidth="1" strokeLinejoin="round" strokeLinecap="round"/>
          </marker>
        </defs>
      </svg>
      <Toolbar />
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        zoomOnDoubleClick={false}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        className={`reactflow-canvas ${activeTool === 'connect' && connectionStartNode ? 'connecting-mode' : ''}`}
        connectionLineComponent={CustomConnectionLine}
        connectionLineStyle={{ stroke: 'rgb(88, 88, 88)', strokeWidth: 1 }}
      >
        <Background bgColor='#090A10' color='rgb(82, 82, 82)' variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default Canvas;
