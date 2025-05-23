import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlow, Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges, Connection, addEdge, useNodesState, useEdgesState, NodeTypes, EdgeTypes, Controls, Background, BackgroundVariant, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TextNode from '../TextNode';
import FloatingEdge from '../CustomEdge';
import Toolbar from '../Toolbar';
import './styles.css';
import { useToolStore } from '../../store/toolStore';
import CustomConnectionLine from './CustomConnectionLine';
import useInertialPan from '../../utils/useInertialPan';
import { saveCanvasState, loadCanvasState, CanvasState } from '../../utils/persistence';

// 注册自定义节点类型
const nodeTypes = {
  textNode: TextNode,
};

// 注册自定义边类型
const edgeTypes: EdgeTypes = {
  custom: FloatingEdge,
};

const initialNodes: Node[] = [
  { id: '1', position: { x: 400, y: 20 }, data: { label: 'function add(a, b) {\n  return a + b;\n}', result: '结果: add(2, 3) = 5' }, type: 'textNode' },
  { id: '2', position: { x: 100, y: 250 }, data: { label: 'const x = 10;\nconst y = 20;', result: 'x = 10, y = 20' }, type: 'textNode' },
  { id: '3', position: { x: 700, y: 250 }, data: { label: 'console.log("Hello World");', result: 'Hello World' }, type: 'textNode' },
  { id: '4', position: { x: 400, y: 480 }, data: { label: 'const arr = [1, 2, 3];\narr.map(x => x * 2);', result: '[2, 4, 6]' }, type: 'textNode' },
  { id: '5', position: { x: 100, y: 720 }, data: { label: 'const obj = {\n  name: "John",\n  age: 30\n};', result: '{name: "John", age: 30}' }, type: 'textNode' },
  { id: '6', position: { x: 700, y: 720 }, data: { label: 'function multiply(a, b) {\n  return a * b;\n}', result: '结果: multiply(4, 5) = 20' }, type: 'textNode' },
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
  // 尝试从 localStorage 恢复初始状态
  const persisted = loadCanvasState();
  const [nodes, setNodes, onNodesChange] = useNodesState(persisted?.nodes || initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(persisted?.edges || initialEdges);
  
  // 当前活动工具（全局）
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  
  // 连接模式的状态
  const [connectionStartNode, setConnectionStartNode] = useState<string | null>(null);
  
  // ReactFlow 实例引用
  const { screenToFlowPosition, setViewport, getViewport } = useReactFlow();

  // 惯性/缓动式视野移动（WASD）
  useInertialPan({ setViewport, getViewport });

  // V/T/C 快捷键切换工具栏模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 编辑区聚焦时不响应
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable);
      if (isEditable) return;
      if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
        e.preventDefault();
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('text');
        e.preventDefault();
      } else if (e.key === 'c' || e.key === 'C') {
        setActiveTool('connect');
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTool]);

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

  // 自动保存到 localStorage
  useEffect(() => {
    saveCanvasState(nodes, edges);
  }, [nodes, edges]);

  // 导出画布状态为 JSON 文件
  const handleExport = useCallback(() => {
    const data: CanvasState = {
      version: 1,
      nodes,
      edges,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'julia-canvas-flow.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  // 导入画布状态
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          const data = JSON.parse(text);
          if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
            setNodes(data.nodes);
            setEdges(data.edges);
          } else {
            alert('导入的文件格式不正确');
          }
        } catch (err) {
          alert('导入失败，文件内容无法解析');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setNodes, setEdges]);

  return (
    <div className={`canvas-container${activeTool === 'text' ? ' text-mode' : ''}`}
      style={{ cursor: activeTool === 'text' ? 'text' : undefined }}
    >
      {/* 箭头(marker)全局定义，所有边和连接线复用 */}
      <svg style={{ position: 'absolute' }}>
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
            <polyline points="5,6 10,10 1.5,10 10,10 5,14" fill="none" stroke='rgb(88, 88, 88)' strokeWidth="1" strokeLinejoin="round" strokeLinecap="round"/>
          </marker>
        </defs>
      </svg>

      {/* 工具栏 */}
      <Toolbar onImport={handleImport} onExport={handleExport} />

      {/* 画布 */}
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
        connectionLineStyle={{ stroke: 'rgba(255, 255, 255, 0.30)', strokeWidth: 1 }}
      >
        <Background bgColor='#090A10' color='rgba(209, 247, 255, 0.24)' variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default Canvas;
