import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  EdgeTypes,
  Node,
  NodeTypes,
  ReactFlow,
  ReactFlowInstance,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useCallback, useEffect } from 'react';

import BottomToolbar from '@/components/BottomToolbar';
import FloatingEdge from '@/components/CustomEdge';
import DesmosPreviewNode from '@/components/DesmosPreviewNode';
import SettingsPanel from '@/components/SettingsPanel';
import TextNode from '@/components/TextNode';
import Toolbar from '@/components/Toolbar';
import { CanvasEvalProvider } from '@/contexts/CanvasEvalContext';
import { CanvasDataProvider } from '@/contexts/CanvasDataContext';
import { useCanvasEval } from '@/hooks/useCanvasEval';
import { useCanvasStatePersistence } from '@/hooks/useCanvasStatePersistence';
import { useCanvasData } from '@/hooks/useCanvasData';
import { parseCanvasArchiveText, serializeCanvasArchive } from '@/services/canvas-archive';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/settingsStore';
import { useToolStore } from '@/store/toolStore';
import { CanvasEdgeFlowData, CanvasNodeFlowData } from '@/types/canvas';
import useInertialPan from '@/utils/useInertialPan';
import CustomConnectionLine from './CustomConnectionLine';
import './styles.css';

// 注册自定义节点类型
const nodeTypes: NodeTypes = {
  textNode: TextNode,
  desmosPreviewNode: DesmosPreviewNode,
};

// 注册自定义边类型
const edgeTypes: EdgeTypes = {
  custom: FloatingEdge,
  desmosPreviewEdge: FloatingEdge,
};

const Canvas: React.FC = () => {
  
  // 创建 API 对象（UI/Flow 共享同一个 store）
  const canvasDataApi = useCanvasData();
  const evalApi = useCanvasEval();
  const { isHydrated } = useCanvasStatePersistence(canvasDataApi);

  // 连接两个 API：双向订阅
  useEffect(() => {
    // Eval 订阅 UI 的变化（主要是 controls）
    const unsubscribeEvalFromUI = evalApi.bridge.connectUI(canvasDataApi);

    // UI 订阅 Eval 的变化
    const unsubscribeUIFromEval = canvasDataApi.bridge.connectEval(evalApi);

    return () => {
      unsubscribeEvalFromUI();
      unsubscribeUIFromEval();
    };
  }, [canvasDataApi, evalApi]);

  const flowNodes = canvasDataApi.readFlow.useFlowData((data) => data.nodes);
  const flowEdges = canvasDataApi.readFlow.useFlowData((data) => data.edges);
  const viewport = canvasDataApi.readFlow.useFlowData((data) => data.viewport);

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
  const { screenToFlowPosition, setViewport: setFlowViewport, getViewport } = useReactFlow();

  // viewport from flowData to ReactFlow
  useEffect(() => {
    if (viewport) {
      setFlowViewport(viewport);
    }
  }, [viewport, setFlowViewport]);

  // 惯性/缓动式视野移动（WASD）
  useInertialPan({ setViewport: setFlowViewport, getViewport });

  // onInit 时主动推送一次视角，避免首次渲染时闪烁
  const handleInit = useCallback((reactFlowInstance: ReactFlowInstance<CanvasNodeFlowData, CanvasEdgeFlowData>) => {
    if (!viewport) return;
    reactFlowInstance.setViewport(viewport);
  }, [viewport]);

  // 应用主题设置
  useTheme();

  // V/T/C 快捷键切换工具栏模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 优先处理 Ctrl+S，确保阻止浏览器默认行为
      if ((e.key === 's' || e.key === 'S') && e.ctrlKey) {
        e.preventDefault();
        console.log('Canvas Ctrl+S: 保存所有更改');

        // 触发所有有未保存更改的节点重新执行
        const updateEvent = new CustomEvent('save-all-changes', {
          detail: { timestamp: Date.now() }
        });
        document.dispatchEvent(updateEvent);
        return;
      }

      // 编辑区聚焦时不响应其他快捷键
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
        const selectedNodes = flowNodes.filter(node => node.selected);
        const selectedEdges = flowEdges.filter(edge => edge.selected);
        selectedNodes.forEach(node => canvasDataApi.graph.removeNode(node.id));
        selectedEdges.forEach(edge => canvasDataApi.graph.removeEdge(edge.id));

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

    window.addEventListener('keydown', handleKeyDown, true); // 使用 capture 模式
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [setActiveTool, activeTool, setConnectionStartNode, canvasDataApi, flowNodes, flowEdges]);

  // 重置画布为默认状态
  const handleReset = useCallback(() => {
    canvasDataApi.graph.resetToDefault();
    setActiveTool('select');
    setConnectionStartNode(null);
  }, [canvasDataApi, setActiveTool, setConnectionStartNode]);

  // 处理画布空白点击事件
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'text') {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      canvasDataApi.graph.createTextNode({
        position,
        data: {
          initialEditing: true,
          width: 400,
        },
      });
      setActiveTool('select'); // 创建后切回选择模式
    }

    // 双击检测逻辑（简单实现）
    if (activeTool === 'select' && event.detail === 2) {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      canvasDataApi.graph.createTextNode({
        position,
        data: {
          initialEditing: true,
          width: 400,
        },
      });
    }
  }, [activeTool, screenToFlowPosition, canvasDataApi, setActiveTool]);

  // 处理连接事件
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    canvasDataApi.graph.createDepEdge({
      sourceId: connection.source,
      targetId: connection.target,
    });

    // 连接完成后，清除连接状态并退出连接模式
    setConnectionStartNode(null);
    if (activeTool === 'connect') {
      setActiveTool('select');
    }
  }, [canvasDataApi, setConnectionStartNode, activeTool, setActiveTool]);

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
        canvasDataApi.graph.createDepEdge({
          sourceId: connectionStartNode,
          targetId: node.id,
        });
        console.log('创建连接:', connectionStartNode, '->', node.id);

        // 重置连接状态并退出连接模式
        setConnectionStartNode(null);
        setActiveTool('select');
      }
    }
  }, [activeTool, connectionStartNode, setConnectionStartNode, canvasDataApi, setActiveTool]);

  // 导出画布数据
  const handleExport = useCallback(() => {
    const data = canvasDataApi.porting.exportCanvasData();
    // 创建下载链接
    const dataStr = serializeCanvasArchive(data);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'canvas-data.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [canvasDataApi]);

  // 导入并替换画布数据
  const handleImportReplace = useCallback(async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const imported = parseCanvasArchiveText(e.target?.result as string);
              if (!imported) {
                throw new Error('导入失败：文件格式错误');
              }
              canvasDataApi.porting.importCanvasData(imported);
              console.log('画布数据已替换');
            } catch (error) {
              console.error('导入画布失败:', error);
              alert('导入失败：文件格式错误');
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    } catch (error) {
      console.error('导入画布失败:', error);
      alert(error instanceof Error ? error.message : '导入失败');
    }
  }, [canvasDataApi]);

  // 导入并添加节点到画布
  const handleImportAdd = useCallback(async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const imported = parseCanvasArchiveText(e.target?.result as string);
              if (!imported) {
                throw new Error('导入失败：文件格式错误');
              }
              const exported = canvasDataApi.porting.exportCanvasData();
              const incomingUINodes = imported.uiData.nodes;
              const incomingUIEdges = imported.uiData.edges;
              const incomingFlowNodes = imported.flowData.nodes;
              const incomingFlowEdges = imported.flowData.edges;
              canvasDataApi.porting.importCanvasData({
                uiData: {
                  // v9 持久化层使用 Record，合并时按 id 覆盖。
                  nodes: { ...exported.uiData.nodes, ...incomingUINodes },
                  edges: { ...exported.uiData.edges, ...incomingUIEdges },
                },
                flowData: {
                  nodes: [...exported.flowData.nodes, ...incomingFlowNodes],
                  edges: [...exported.flowData.edges, ...incomingFlowEdges],
                  viewport: exported.flowData.viewport,
                },
              });
              console.log('节点已添加到画布');
            } catch (error) {
              console.error('导入节点失败:', error);
              alert('导入失败：文件格式错误');
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    } catch (error) {
      console.error('导入节点失败:', error);
      alert(error instanceof Error ? error.message : '导入失败');
    }
  }, [canvasDataApi]);

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

  /*
  *      ----------- 组件结构 ------------
  */

  return (
    <CanvasDataProvider api={canvasDataApi}>
      <CanvasEvalProvider api={evalApi}>
        <div className={`canvas-container ${activeTool}-mode`}>
          {isHydrated ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={(changes) => canvasDataApi.writeFlow.handleFlowNodesChange(changes)}
            onEdgesChange={(changes) => canvasDataApi.writeFlow.handleFlowEdgesChange(changes)}
            onConnect={onConnect}
            onPaneClick={handlePaneClick}
            onNodeClick={onNodeClick}
            onInit={handleInit}
            onMoveEnd={(_event, newViewport) => { if (newViewport) canvasDataApi.writeFlow.setViewport(newViewport); }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineComponent={CustomConnectionLine}
            connectionLineStyle={connectionLineStyle}
            className="reactflow-canvas"
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
                  markerWidth={8}
                  markerHeight={8}
                  refX={6}
                  refY={2}
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path
                    d="M0,0 L0,4 L6,2 z"
                    fill="rgba(100, 200, 255, 0.8)"
                    stroke="rgba(100, 200, 255, 0.8)"
                  />
                </marker>
              </defs>
            </svg>
          </ReactFlow>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-white">Loading...</div>
            </div>
          )}

          <Toolbar />

          {/* 底部工具栏 */}
          <BottomToolbar
            onSettingsClick={toggleSettingsPanel}
            onExport={handleExport}
            onImportReplace={handleImportReplace}
            onImportAdd={handleImportAdd}
            onReset={handleReset}
          />

          {/* 设置面板 */}
          <SettingsPanel
            isOpen={isSettingsPanelOpen}
            onClose={closeSettingsPanel}
          />
        </div>
      </CanvasEvalProvider>
    </CanvasDataProvider>
  );
};

export default Canvas;