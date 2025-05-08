import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  EdgeTypes,
  Controls,
  Background,
  BackgroundVariant,
  ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';

import TextNode from '../TextNode';
import CustomEdge from '../CustomEdge';
import Toolbar, { ToolType } from '../Toolbar';
import './styles.css';

// 注册自定义节点类型
const nodeTypes: NodeTypes = {
  textNode: TextNode,
};

// 注册自定义边类型
const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
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
  
  // 当前活动工具
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  
  // 连接模式的状态
  const [connectionStartNode, setConnectionStartNode] = useState<string | null>(null);
  
  // ReactFlow 实例引用
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // 复用的创建新节点函数
  const createTextNode = useCallback((position: { x: number; y: number }) => ({
    id: `node-${Date.now()}`,
    type: 'textNode',
    position,
    data: { label: '', initialEditing: true },
  }), []);

  // 处理工具变更
  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    // 重置连接状态
    setConnectionStartNode(null);
  }, []);

  // 处理连接完成
  const onConnect = useCallback(
    (connection: Connection) => {
      // 创建一个新的边，使用自定义边类型
      setEdges((eds) => addEdge({ ...connection, type: 'custom' }, eds));
    },
    [setEdges]
  );

  // 处理节点点击，用于连接工具模式
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // 只在连接工具模式下处理
      if (activeTool === 'connect') {
        event.preventDefault();
        
        if (!connectionStartNode) {
          // 设置连接起点
          setConnectionStartNode(node.id);
        } else if (connectionStartNode !== node.id) {
          // 创建连接
          const newEdge: Edge = {
            id: `e${connectionStartNode}-${node.id}`,
            source: connectionStartNode,
            target: node.id,
            type: 'custom',
            sourceHandle: 'main',
            targetHandle: 'main',
          };
          
          setEdges((eds) => [...eds, newEdge]);
          setConnectionStartNode(null); // 重置连接状态
        }
      }
    },
    [activeTool, connectionStartNode, setEdges]
  );

  // 选择模式下双击空白处创建节点
  const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
    // 只允许在选择模式下，且双击空白处时触发
    if (activeTool === 'select' && reactFlowInstance.current) {
      // 判断是否双击在节点或边上（避免误触）
      if ((event.target as HTMLElement).closest('.react-flow__node') || (event.target as HTMLElement).closest('.react-flow__edge')) {
        return;
      }
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = reactFlowInstance.current.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      setNodes((nds) => [...nds, createTextNode(position)]);
    }
  }, [activeTool, setNodes, createTextNode]);

  // 处理画布点击，用于取消连接或创建新节点
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'text' && reactFlowInstance.current) {
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = reactFlowInstance.current.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      setNodes((nds) => [...nds, createTextNode(position)]);
      setActiveTool('select'); // 创建后切回选择模式
      return;
    }
    if (connectionStartNode) {
      setConnectionStartNode(null);
    }
  }, [activeTool, setNodes, connectionStartNode, createTextNode]);

  return (
    <div className="canvas-container">
      <Toolbar activeTool={activeTool} onToolChange={handleToolChange} />
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        zoomOnDoubleClick={false}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => (reactFlowInstance.current = instance)}
        fitView
        snapToGrid
        className={`reactflow-canvas ${activeTool === 'connect' && connectionStartNode ? 'connecting-mode' : ''}`}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
      </ReactFlow>
      {connectionStartNode && (
        <div className="connection-indicator">
          正在创建连接，请选择目标节点或点击空白区域取消
        </div>
      )}
    </div>
  );
};

export default Canvas;
