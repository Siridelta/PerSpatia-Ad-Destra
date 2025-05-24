import React, { useCallback, useEffect } from 'react';
import { ReactFlow, Node, Edge, Connection, addEdge, useNodesState, useEdgesState, EdgeTypes, Controls, Background, BackgroundVariant, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TextNode from '../TextNode';
import FloatingEdge from '../CustomEdge';
import Toolbar from '../Toolbar';
import './styles.css';
import { useToolStore } from '../../store/toolStore';
import CustomConnectionLine from './CustomConnectionLine';
import useInertialPan from '../../utils/useInertialPan';
import { saveCanvasState, loadCanvasState } from '../../utils/persistence';

// 注册自定义节点类型
const nodeTypes = {
  textNode: TextNode,
};

// 注册自定义边类型
const edgeTypes: EdgeTypes = {
  custom: FloatingEdge,
};

const initialNodes: Node[] = [
  { 
    id: '1', 
    position: { x: 400, y: 20 }, 
    data: { 
      label: '@slidebar(0, 100, 1, 50) x\n@slidebar(0, 100, 1, 30) y\nconst sum = x + y;\nconst product = x * y;\n@log "计算结果: sum=" * string(sum)\n@log "product=" * string(product)\n@output sum\n@output product', 
      result: '结果计算中...' 
    }, 
    type: 'textNode' 
  },
  { 
    id: '2', 
    position: { x: 100, y: 250 }, 
    data: { 
      label: '# sum 和 product 将从连接的节点自动获取\nconst average = (sum + product) / 2;\nconst ratio = product / sum;\n@log "平均值: " * string(average)\n@log "比值: " * string(ratio)\n@output average\n@output ratio', 
      result: 'average计算中...' 
    }, 
    type: 'textNode' 
  },
  { 
    id: '3', 
    position: { x: 700, y: 250 }, 
    data: { 
      label: '@inputbox("Hello World") message\n@log message\n@log "消息长度: " * string(length(message))\n@output message', 
      result: '消息处理中...' 
    }, 
    type: 'textNode' 
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'custom' },
];

const Canvas: React.FC = () => {
  // 尝试从 localStorage 恢复初始状态
  const persisted = loadCanvasState();
  const [nodes, setNodes, onNodesChange] = useNodesState(persisted?.nodes || initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(persisted?.edges || initialEdges);
  
  // 当前活动工具（全局）
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const connectionStartNode = useToolStore((state) => state.connectionStartNode);
  const setConnectionStartNode = useToolStore((state) => state.setConnectionStartNode);
  
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
        setConnectionStartNode(null); // 清除连接状态
        e.preventDefault();
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('text');
        setConnectionStartNode(null); // 清除连接状态
        e.preventDefault();
      } else if (e.key === 'c' || e.key === 'C') {
        // C键切换连接模式
        if (activeTool === 'connect') {
          setActiveTool('select');
          setConnectionStartNode(null); // 退出连接模式时清除连接状态
        } else {
          setActiveTool('connect');
        }
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // 删除选中的节点和边
        setNodes((nds) => nds.filter(node => !node.selected));
        setEdges((eds) => eds.filter(edge => !edge.selected));
        e.preventDefault();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // 全局中键处理，防止浏览器默认行为
      if (e.button === 1) {
        e.preventDefault();
        console.log('全局中键按下事件');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [setActiveTool, activeTool, setConnectionStartNode, setNodes, setEdges]);

  // 复用的创建新节点函数
  const createTextNode = useCallback((position: { x: number; y: number }) => ({
    id: `node-${Date.now()}`,
    type: 'textNode',
    position,
    data: { label: '', initialEditing: true },
  }), []);

  // 处理画布空白点击事件
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'text') {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode = createTextNode(position);
      setNodes((nds) => [...nds, newNode]);
      setActiveTool('select'); // 创建后切回选择模式
    }
    
    // 双击检测逻辑（简单实现）
    if (activeTool === 'select' && event.detail === 2) {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode = createTextNode(position);
      setNodes((nds) => [...nds, newNode]);
    }
  }, [activeTool, screenToFlowPosition, createTextNode, setNodes, setActiveTool]);

  // 处理连接事件
  const onConnect = useCallback((connection: Connection) => {
    const edge = {
      ...connection,
      id: `edge-${Date.now()}`,
      type: 'custom',
    };
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges]);

  // 自动保存状态
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCanvasState(nodes, edges);
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // 连接线样式
  const connectionLineStyle = {
    stroke: 'rgba(100, 200, 255, 0.6)',
    strokeWidth: 2,
    strokeDasharray: '4 4',
  };

  // 默认边选项
  const defaultEdgeOptions = {
    type: 'custom',
  };

  return (
    <div className={`canvas-container ${activeTool}-mode`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineComponent={CustomConnectionLine}
        connectionLineStyle={connectionLineStyle}
        className="reactflow-canvas"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        deleteKeyCode={['Delete', 'Backspace']}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls position="bottom-right" />
        
        {/* 自定义箭头标记 */}
        <svg>
          <defs>
            <marker
              id="custom-edge-arrow"
              markerWidth={12}
              markerHeight={12}
              refX={9}
              refY={3}
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0,0 L0,6 L9,3 z"
                fill="rgba(100, 200, 255, 0.8)"
                stroke="rgba(100, 200, 255, 0.8)"
              />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
      
      <Toolbar />
      
      {/* 状态栏 */}
      <div className="status-bar">
        {activeTool === 'select' && '选择模式 - 双击空白处创建节点'}
        {activeTool === 'text' && '文本模式 - 单击空白处创建节点'}
        {activeTool === 'connect' && '连接模式 - 拖动节点进行连接'}
        {connectionStartNode && ' | 选择目标节点完成连接'}
      </div>
    </div>
  );
};

export default Canvas;