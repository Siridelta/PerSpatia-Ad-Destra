import React, { useCallback, useEffect } from 'react';
import { ReactFlow, Node, Edge, Connection, addEdge, useNodesState, useEdgesState, EdgeTypes, Controls, Background, BackgroundVariant, useReactFlow, EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TextNode from '../TextNode';
import FloatingEdge from '../CustomEdge';
import Toolbar from '../Toolbar';
import BottomToolbar from '../BottomToolbar';
import SettingsPanel from '../SettingsPanel';
import './styles.css';
import { useToolStore } from '../../store/toolStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import CustomConnectionLine from './CustomConnectionLine';
import useInertialPan from '../../utils/useInertialPan';
import { saveCanvasState, loadCanvasState } from '../../utils/persistence';
import { exportCanvasData, importCanvasData, importNodesToCanvas } from '../../utils/import-export';

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
      label: 'let speed = node_input(new Slider(50, 0, 100, 1));\nlet name = node_input(new InputBox("测试"));\nlet enabled = node_input(new Switch(true));\n\nlet result = speed * 2;\nnode_output(result);\nconsole.log("速度:", speed, "名称:", name, "启用:", enabled);', 
      result: '结果计算中...',
      width: 500
    }, 
    type: 'textNode' 
  },
  { 
    id: '2', 
    position: { x: 100, y: 250 }, 
    data: { 
      label: '// result 将从连接的节点自动获取\nlet doubled = result * 2;\nlet message = `结果的两倍是: ${doubled}`;\nnode_output(doubled);\nconsole.log(message);', 
      result: 'doubled计算中...',
      width: 400
    }, 
    type: 'textNode' 
  },
  { 
    id: '3', 
    position: { x: 700, y: 250 }, 
    data: { 
      label: 'let message = node_input(new InputBox("Hello World"));\nlet length = message.length;\nnode_output(message);\nconsole.log("消息:", message, "长度:", length);', 
      result: '消息处理中...',
      width: 450
    }, 
    type: 'textNode' 
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'custom' },
];

const Canvas: React.FC = () => {
  // 尝试从 localStorage 恢复初始状态，但如果没有保存的数据就使用新的初始节点
  const persisted = loadCanvasState();
  const [nodes, setNodes, onNodesChange] = useNodesState(persisted?.nodes || initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(persisted?.edges || initialEdges);
  
  // 当前活动工具（全局）
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const connectionStartNode = useToolStore((state) => state.connectionStartNode);
  const setConnectionStartNode = useToolStore((state) => state.setConnectionStartNode);
  
  // 设置面板状态
  const isSettingsPanelOpen = useSettingsStore((state) => state.isSettingsPanelOpen);
  const toggleSettingsPanel = useSettingsStore((state) => state.toggleSettingsPanel);
  const closeSettingsPanel = useSettingsStore((state) => state.closeSettingsPanel);
  
  // ReactFlow 实例引用
  const { screenToFlowPosition, setViewport, getViewport } = useReactFlow();

  // 惯性/缓动式视野移动（WASD）
  useInertialPan({ setViewport, getViewport });

  // 应用主题设置
  useTheme();

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
    data: { 
      label: '', 
      initialEditing: true,
      width: 400  // 默认宽度
    },
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
    
    // 连接建立后，立即通知目标节点更新
    if (connection.target) {
      console.log('新连接建立，通知目标节点更新:', connection.source, '->', connection.target);
      
      // 延迟一点时间确保连接已经添加到edges中
      setTimeout(() => {
        const updateEvent = new CustomEvent('node-upstream-changed', {
          detail: { 
            nodeId: connection.target,
            sourceNodeId: connection.source,
            timestamp: Date.now(),
            reason: 'new-connection'
          }
        });
        document.dispatchEvent(updateEvent);
      }, 50);
    }
    
    // 连接完成后，清除连接状态并退出连接模式
    setConnectionStartNode(null);
    if (activeTool === 'connect') {
      setActiveTool('select');
    }
  }, [setEdges, setConnectionStartNode, activeTool, setActiveTool]);

  // 处理节点点击（用于连接模式）
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    
    if (activeTool === 'connect') {
      if (!connectionStartNode) {
        // 设置连接起始节点
        setConnectionStartNode(node.id);
        console.log('设置连接起始节点:', node.id);
      } else if (connectionStartNode !== node.id) {
        // 创建连接
        const newEdge = {
          id: `edge-${Date.now()}`,
          source: connectionStartNode,
          target: node.id,
          type: 'custom',
        };
        setEdges((eds) => [...eds, newEdge]);
        console.log('创建连接:', connectionStartNode, '->', node.id);
        
        // 连接建立后，立即通知目标节点更新
        setTimeout(() => {
          const updateEvent = new CustomEvent('node-upstream-changed', {
            detail: { 
              nodeId: node.id,
              sourceNodeId: connectionStartNode,
              timestamp: Date.now(),
              reason: 'new-connection'
            }
          });
          document.dispatchEvent(updateEvent);
        }, 50);
        
        // 重置连接状态并退出连接模式
        setConnectionStartNode(null);
        setActiveTool('select');
      }
    }
  }, [activeTool, connectionStartNode, setConnectionStartNode, setEdges, setActiveTool]);

  // 自动保存状态
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCanvasState(nodes, edges);
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // 节点依赖更新逻辑：当节点输出改变时，更新所有下游节点
  const triggerDownstreamUpdate = useCallback((sourceNodeId: string) => {
    console.log('触发下游节点更新，源节点:', sourceNodeId);
    
    // 找到所有从sourceNodeId出发的边
    const downstreamEdges = edges.filter(edge => edge.source === sourceNodeId);
    
    if (downstreamEdges.length === 0) {
      console.log('没有下游节点需要更新');
      return;
    }
    
    // 获取所有下游节点ID
    const downstreamNodeIds = downstreamEdges.map(edge => edge.target);
    console.log('需要更新的下游节点:', downstreamNodeIds);
    
    // 为每个下游节点触发更新
    downstreamNodeIds.forEach(nodeId => {
      // 通过自定义事件通知节点更新
      const updateEvent = new CustomEvent('node-upstream-changed', {
        detail: { 
          nodeId,
          sourceNodeId,
          timestamp: Date.now()
        }
      });
      document.dispatchEvent(updateEvent);
      
      // 递归更新更下游的节点
      setTimeout(() => {
        triggerDownstreamUpdate(nodeId);
      }, 100); // 延迟一点时间确保当前节点先完成更新
    });
  }, [edges]);

  // 监听节点变化，检测输出变化并触发下游更新
  useEffect(() => {
    // 检查节点输出是否发生变化
    const checkNodeOutputChanges = () => {
      nodes.forEach(node => {
        if (node.type === 'textNode' && node.data.outputs) {
          const nodeId = node.id;
          const currentOutputs = node.data.outputs;
          
          // 使用ref来存储上一次的输出，避免无限循环
          const prevOutputsKey = `prevOutputs_${nodeId}`;
          const prevOutputs = (window as any)[prevOutputsKey];
          
          if (prevOutputs && JSON.stringify(currentOutputs) !== JSON.stringify(prevOutputs)) {
            console.log('检测到节点输出变化:', nodeId, currentOutputs);
            triggerDownstreamUpdate(nodeId);
          }
          
          // 更新缓存的输出
          (window as any)[prevOutputsKey] = JSON.parse(JSON.stringify(currentOutputs));
        }
      });
    };
    
    // 延迟检查，避免初始化时的误触发
    const timer = setTimeout(checkNodeOutputChanges, 200);
    return () => clearTimeout(timer);
  }, [nodes, triggerDownstreamUpdate]);

  // 导出画布数据
  const handleExport = useCallback(() => {
    exportCanvasData(nodes, edges);
  }, [nodes, edges]);

  // 导入并替换画布数据
  const handleImportReplace = useCallback(async () => {
    try {
      const { nodes: newNodes, edges: newEdges } = await importCanvasData();
      setNodes(newNodes);
      setEdges(newEdges);
      console.log('画布数据已替换');
    } catch (error) {
      console.error('导入画布失败:', error);
      alert(error instanceof Error ? error.message : '导入失败');
    }
  }, [setNodes, setEdges]);

  // 导入并添加节点到画布
  const handleImportAdd = useCallback(async () => {
    try {
      const { nodes: newNodes, edges: newEdges } = await importCanvasData();
      const { nodes: mergedNodes, edges: mergedEdges } = importNodesToCanvas(nodes, edges, newNodes, newEdges);
      setNodes(mergedNodes);
      setEdges(mergedEdges);
      console.log('节点已添加到画布');
    } catch (error) {
      console.error('导入节点失败:', error);
      alert(error instanceof Error ? error.message : '导入失败');
    }
  }, [nodes, edges, setNodes, setEdges]);

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

  // 自定义边变化处理，增加删除连接时的更新逻辑
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    // 先获取当前边的信息，用于检测删除
    const currentEdges = edges;
    
    // 处理边变化
    onEdgesChange(changes);
    
    // 检查是否有边被删除
    changes.forEach(change => {
      if (change.type === 'remove') {
        const removedEdge = currentEdges.find(edge => edge.id === change.id);
        if (removedEdge && removedEdge.target) {
          console.log('连接被删除，通知目标节点更新:', removedEdge.source, '->', removedEdge.target);
          
          // 延迟一点时间确保边已经从edges中删除
          setTimeout(() => {
            const updateEvent = new CustomEvent('node-upstream-changed', {
              detail: { 
                nodeId: removedEdge.target,
                sourceNodeId: removedEdge.source,
                timestamp: Date.now(),
                reason: 'connection-removed'
              }
            });
            document.dispatchEvent(updateEvent);
          }, 50);
        }
      }
    });
  }, [edges, onEdgesChange]);


  /*
  *      ----------- 组件结构 ------------
  */


  return (
    <div className={`canvas-container ${activeTool}-mode`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onPaneClick={handlePaneClick}
        onNodeClick={onNodeClick}
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
        maxZoom={10}
        minZoom={0.1}
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
      
      {/* 底部工具栏 */}
      <BottomToolbar 
        onSettingsClick={toggleSettingsPanel} 
        onExport={handleExport}
        onImportReplace={handleImportReplace}
        onImportAdd={handleImportAdd}
      />
      
      {/* 设置面板 */}
      <SettingsPanel 
        isOpen={isSettingsPanelOpen} 
        onClose={closeSettingsPanel} 
      />
    </div>
  );
};

export default Canvas;