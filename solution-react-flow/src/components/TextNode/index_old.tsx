import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow, NodeResizeControl } from '@xyflow/react';
import './styles.css';
import '@/styles/syntax-highlighting.css';
import { jsExecutor, ControlInfo } from '@/services/jsExecutor';
import { useToolStore } from '@/store/toolStore';
import { SliderControl, ToggleControl, TextControl } from './controls';
import { ErrorDisplay, WarningDisplay, LogDisplay, OutputDisplay } from './displays';
import CodeEditor from '../CodeEditor';
import { useNodeExecution } from './hooks/useNodeExecution';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';

export type TextNodeData = {
  label: string;
  result?: string;
  controls?: ControlInfo[];
  showControls?: boolean;
  outputs?: Record<string, any>;
  consoleLogs?: string[];
  constants?: Record<string, any>; // 存储计算的常量值
  width?: number; // 添加宽度支持
  height?: number; // 添加高度支持
  nodeName?: string; // 节点名称
  isCollapsed?: boolean; // 是否完全折叠
  hiddenSections?: {
    inputs?: boolean;
    outputs?: boolean;
    logs?: boolean;
    errors?: boolean;
  }; // 隐藏的区域
  errors?: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>; // 错误信息数组
  warnings?: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>; // 警告信息数组
};

export type TextNodeType = Node<TextNodeData, 'text'>;

// 工具函数：将光标定位到指定页面坐标（x, y）处
function placeCaretAtPoint(x: number, y: number) {
  let range: Range | null = null;
  if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (range) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  }
  return false;
}

const TextNode: React.FC<NodeProps<TextNodeType>> = ({ id, data, selected }) => {
  const [isEditingName, setIsEditingName] = useState(false); // 是否在编辑节点名称
  const [nodeName, setNodeName] = useState(data.nodeName || '未命名节点');

  // 处理文本变化
  const handleTextChange = (newText: string) => {
    // 更新节点数据
    updateNodeData({ label: newText });
    // 检查是否有未保存的更改
    const originalText = data.label || '';
    setHasUnsavedChanges(newText !== originalText);
  };

  // 处理退出编辑
  const handleExitEdit = () => {
    // 退出编辑时的处理
    // 清除未保存状态
    setHasUnsavedChanges(false);
    // 触发代码重新执行
    const finalCode = data.label || '';
    if (finalCode.trim()) {
      executeCode(finalCode, controlValues);
    }
  };

  // 获取当前工具状态
  const activeTool = useToolStore((state) => state.activeTool);

  // 动画状态管理
  const [animatingOut, setAnimatingOut] = useState<{
    inputs?: boolean;
    outputs?: boolean;
    logs?: boolean;
    errors?: boolean; // 添加错误区域动画状态
  }>({});



  // React Flow 实例，用于更新节点数据
  const { setNodes, getNodes, getEdges } = useReactFlow();

  // 获取所有连接节点的输出数据
  const getConnectedNodeData = useCallback(() => {
    const edges = getEdges();
    const nodes = getNodes();
    const connectedData: Record<string, any> = {};

    // 找到连接到当前节点的边
    const incomingEdges = edges.filter(edge => edge.target === id);

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(node => node.id === edge.source);
      if (sourceNode && sourceNode.data && sourceNode.data.outputs) {
        // 从源节点的输出中获取所有值
        const sourceOutputs = sourceNode.data.outputs as Record<string, any>;
        Object.assign(connectedData, sourceOutputs);
      }
    }

    console.log('从连接节点获取的数据:', connectedData);
    return connectedData;
  }, [id, getNodes, getEdges]);

  // 编辑器元素引用
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 使用节点执行Hook
  const {
    isExecuting,
    controls,
    outputs,
    consoleLogs,
    errors,
    warnings,
    executeCode,
    setControls,
    setOutputs,
    setConsoleLogs,
    setErrors,
    setWarnings,
  } = useNodeExecution({
    id,
    onControlsChange: (newControls) => {
      updateNodeData({ controls: newControls });
    },
    onOutputsChange: (newOutputs) => {
      updateNodeData({ outputs: newOutputs });
    },
    onLogsChange: (newLogs) => {
      updateNodeData({ consoleLogs: newLogs });
    },
    onErrorsChange: (newErrors) => {
      updateNodeData({ errors: newErrors });
    },
    onWarningsChange: (newWarnings) => {
      updateNodeData({ warnings: newWarnings });
    },
    getConnectedNodeData,
  });

  // derived state: control value
  const controlValues = controls.reduce((acc, control) => {
    acc[control.name] = control.value ?? control.defaultValue;
    return acc;
  }, {} as Record<string, any>);
  // weak set, would not add or remove controls items, items not present would be set to default value
  const setControlValues = useCallback((values: Record<string, any>) => {
    setControls(prevControls =>
      prevControls.map((c: ControlInfo) => ({
        ...c,
        value: values[c.name] ?? c.defaultValue
      }))
    );
  }, []);
  

  // 从data中获取节点宽度，移除最大宽度限制
  const nodeWidth = data.width || 'auto';
  const nodeHeight = data.height || 'auto';

  // 隐藏状态
  const isCollapsed = data.isCollapsed || false;
  const hiddenSections = data.hiddenSections || {};

  // 未保存状态
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);



  // 移除初始化控件值的 useEffect，因为现在直接使用 controls 中的值

  /**
   * 调整节点宽度以适应内容
   * 只在用户没有手动调整宽度时自动调整
   */
  const adjustDisplayWidth = useCallback(() => {
    // 如果用户已经手动调整了宽度，不自动调整
    if (data.width && typeof data.width === 'number') return;

    const nodeContainer = document.querySelector(`[data-id="${id}"] .text-node`) as HTMLElement;
    const currentText = data.label || '';
    if (!nodeContainer || !currentText) return;

    // 创建临时元素测量文本宽度
    const tempElement = document.createElement('pre');
    tempElement.style.fontFamily = 'JetBrains Mono, AlimamaFangYuanTi, monospace';
    tempElement.style.fontSize = '14px';
    tempElement.style.lineHeight = '1.5';
    tempElement.style.whiteSpace = 'pre';
    tempElement.style.position = 'absolute';
    tempElement.style.visibility = 'hidden';
    tempElement.style.top = '-9999px';
    tempElement.style.left = '-9999px';
    tempElement.textContent = currentText;

    document.body.appendChild(tempElement);
    const contentWidth = tempElement.offsetWidth;
    document.body.removeChild(tempElement);

    // 计算节点所需的最小宽度
    const minNodeWidth = Math.max(contentWidth + 60, 300);

    // 更新节点数据中的宽度
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, width: minNodeWidth } }
          : node
      )
    );

    console.log('自动调整节点宽度:', {
      contentWidth,
      minNodeWidth,
      text: currentText?.substring(0, 50) + '...'
    });
  }, [data.label, data.width, id, setNodes]);





  // 当变量列表更新时，更新输出显示和日志
  useEffect(() => {
    console.log('变量列表更新:', controls);
    console.log('输出列表:', outputs);
  }, [controls, outputs]);

  // 当代码变化时，重新解析和执行
  useEffect(() => {
    const currentText = data.label || '';
    if (currentText) {
      // 自动调整节点宽度
      setTimeout(() => {
        adjustDisplayWidth();
      }, 100);

      // 添加延迟执行，避免频繁请求
      const timeoutId = setTimeout(() => {
        // 构建输入变量值的映射，使用控件的当前值
        const inputValues: Record<string, any> = { ...controlValues };

        // 获取连接节点数据
        const connectedData = getConnectedNodeData();

        // 添加从连接节点传来的值
        Object.assign(inputValues, connectedData);
        console.log('执行代码', inputValues);
        // 执行代码
        executeCode(currentText, inputValues);
      }, 300); // 300ms延迟

      return () => clearTimeout(timeoutId);
    }
  }, [data.label, controlValues, executeCode, getConnectedNodeData, adjustDisplayWidth]);

  // 监听上游节点更新事件
  useEffect(() => {
    const handleUpstreamChange = (event: CustomEvent) => {
      const { nodeId, sourceNodeId, timestamp, reason } = event.detail;

      // 检查是否是当前节点需要更新
      if (nodeId === id) {
        console.log(`节点 ${id} 收到上游节点 ${sourceNodeId} 的更新通知，原因: ${reason || 'data-change'}，时间戳: ${timestamp}`);

        // 重新执行代码
        const currentText = data.label || '';
        if (currentText.trim()) {
          const inputValues: Record<string, any> = { ...controlValues };
          const connectedData = getConnectedNodeData();
          Object.assign(inputValues, connectedData);

          console.log(`节点 ${id} 开始重新执行代码，输入数据:`, inputValues);
          executeCode(currentText, inputValues);
        }
      }
    };

    const handleSaveAllChanges = (event: CustomEvent) => {
      // 检查当前节点是否有未保存的更改
      const currentText = data.label || '';
      if (hasUnsavedChanges && currentText.trim()) {
        console.log(`节点 ${id} 收到全局保存命令，重新执行代码`);

        // 清除未保存状态
        setHasUnsavedChanges(false);

        // 重新执行代码
        const inputValues: Record<string, any> = { ...controlValues };
        const connectedData = getConnectedNodeData();
        Object.assign(inputValues, connectedData);

        executeCode(currentText, inputValues);
      }
    };

    // 添加事件监听器
    document.addEventListener('node-upstream-changed', handleUpstreamChange as EventListener);
    document.addEventListener('save-all-changes', handleSaveAllChanges as EventListener);

    // 清理事件监听器
    return () => {
      document.removeEventListener('node-upstream-changed', handleUpstreamChange as EventListener);
      document.removeEventListener('save-all-changes', handleSaveAllChanges as EventListener);
    };
  }, [id, data.label, controlValues, executeCode, getConnectedNodeData, hasUnsavedChanges]);

  // 当变量值变化时，重新执行代码
  const handleVariableChange = useCallback((name: string, value: any) => {
    // 使用统一的设置函数
    const updatedValues = { ...controlValues, [name]: value };
    setControlValues(updatedValues);

    // 延迟重新执行代码
    setTimeout(() => {
      console.log('变量值变化，重新执行代码', updatedValues);
      const inputValues = { ...updatedValues };
      const connectedData = getConnectedNodeData();
      Object.assign(inputValues, connectedData);
      const currentText = data.label || '';
      executeCode(currentText, inputValues);
    }, 100);
  }, [setControlValues, controlValues, executeCode, getConnectedNodeData, data.label]);

  // 渲染控件的函数
  const renderControl = (control: ControlInfo) => {
    const currentValue = control.value ?? control.defaultValue;

    switch (control.type) {
      case 'switch':
        return (
          <ToggleControl
            control={control}
            value={Boolean(currentValue)}
            onChange={handleVariableChange}
          />
        );
      case 'slider':
        return (
          <SliderControl
            control={control}
            value={Number(currentValue) || 0}
            onChange={handleVariableChange}
          />
        );
      case 'input':
        return (
          <TextControl
            control={control}
            value={String(currentValue) || ''}
            onChange={handleVariableChange}
          />
        );
      default:
        return null;
    }
  };



  // 更新节点数据的通用函数
  const updateNodeData = useCallback((updates: Partial<TextNodeData>) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  }, [id, setNodes]);

  // 处理节点名称编辑
  const handleNameEdit = useCallback(() => {
    setIsEditingName(true);
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
  }, []);

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    updateNodeData({ nodeName });
  }, [nodeName, updateNodeData]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setNodeName(data.nodeName || '未命名节点');
      setIsEditingName(false);
    }
  }, [handleNameSubmit, data.nodeName]);

  // 切换折叠状态
  const toggleCollapse = useCallback(() => {
    updateNodeData({ isCollapsed: !isCollapsed });
  }, [isCollapsed, updateNodeData]);

  // 切换隐藏指定区域
  const toggleHideSection = useCallback((section: 'inputs' | 'outputs' | 'logs' | 'errors') => {
    const isCurrentlyVisible = !hiddenSections[section];

    if (isCurrentlyVisible) {
      // 如果当前可见，要隐藏：先播放退出动画，然后隐藏
      setAnimatingOut(prev => ({ ...prev, [section]: true }));

      // 动画完成后隐藏区域
      setTimeout(() => {
        const newHiddenSections = {
          ...hiddenSections,
          [section]: true
        };
        updateNodeData({ hiddenSections: newHiddenSections });
        setAnimatingOut(prev => ({ ...prev, [section]: false }));
      }, 300); // 动画持续时间
    } else {
      // 如果当前隐藏，要显示：直接显示并播放进入动画
      const newHiddenSections = {
        ...hiddenSections,
        [section]: false
      };
      updateNodeData({ hiddenSections: newHiddenSections });
    }
  }, [hiddenSections, updateNodeData]);

  // 恢复输入默认值
  const resetInputsToDefault = useCallback(() => {
    // 重置所有控件到默认值
    const defaultValues = controls.reduce((acc, control) => {
      acc[control.name] = control.defaultValue;
      return acc;
    }, {} as Record<string, any>);
    setControlValues(defaultValues);
    
    // 触发代码重新执行
    const currentText = data.label || '';
    if (currentText.trim()) {
      executeCode(currentText, defaultValues);
    }
  }, [controls, data.label, setControlValues, executeCode]);

  // 复制代码到剪贴板
  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.label || '');
      // 可以添加一个提示消息
    } catch (err) {
      console.error('复制代码失败:', err);
    }
  }, [data.label]);

  // 获取输入变量信息用于折叠状态显示
  const getInputVariablesInfo = useCallback(() => {
    return controls.map(control => ({
      name: control.name,
      type: control.type,
      value: control.value ?? control.defaultValue
    }));
  }, [controls]);

  // 获取输出变量信息用于折叠状态显示
  const getOutputVariablesInfo = useCallback(() => {
    return Object.entries(outputs).map(([name, value]) => ({
      name,
      type: typeof value,
      value
    }));
  }, [outputs]);

  return (
    <div
      className={`text-node${selected ? ' selected' : ''}${isCollapsed ? ' collapsed' : ''}`}
      style={{
        // 只在用户手动设置了宽度时才应用，否则让CSS的max-content生效
        ...(nodeWidth !== 'auto' && { width: `${nodeWidth}px` }),
        height: nodeHeight,
        boxSizing: 'border-box',
        cursor: isCollapsed ? 'default' : 'text',
        minWidth: isCollapsed ? '200px' : '300px',
      }}
    >
      {/* 节点头部 - 名称和控制图标 */}
      <div className="text-node-header">
        <div className="text-node-name-section">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              className="text-node-name-input"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
            />
          ) : (
            <div
              className="text-node-name"
              onDoubleClick={isCollapsed ? toggleCollapse : handleNameEdit}
              onClick={isCollapsed ? toggleCollapse : undefined}
              style={{
                textAlign: isCollapsed ? 'center' : 'left',
                cursor: isCollapsed ? 'pointer' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title={isCollapsed ? '点击展开节点' : '双击编辑名称'}
            >
              {nodeName}
              {hasUnsavedChanges && (
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    flexShrink: 0
                  }}
                  title="未保存的更改"
                />
              )}
            </div>
          )}
        </div>

        {isCollapsed ? (
          // 折叠状态下显示展开按钮
          <div className="text-node-controls">
            <button
              className="control-button"
              onClick={toggleCollapse}
              title="展开节点"
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M7,14L12,9L17,14H7Z" />
              </svg>
            </button>
          </div>
        ) : (
          // 非折叠状态下显示所有控制按钮
          <div className="text-node-controls">
            <button
              className="control-button"
              onClick={() => toggleHideSection('inputs')}
              title={hiddenSections.inputs ? '显示输入' : '隐藏输入'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
              </svg>
            </button>
            <button
              className="control-button"
              onClick={() => toggleHideSection('outputs')}
              title={hiddenSections.outputs ? '显示输出' : '隐藏输出'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19,13H5V11H19V13Z" />
              </svg>
            </button>
            <button
              className="control-button"
              onClick={() => toggleHideSection('logs')}
              title={hiddenSections.logs ? '显示日志' : '隐藏日志'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
            </button>
            <button
              className="control-button"
              onClick={() => toggleHideSection('errors')}
              title={hiddenSections.errors ? '显示错误' : '隐藏错误'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M13,13H11V7H13M11,15H13V17H11M15.73,3H8.27L3,8.27V15.73L8.27,21H15.73L21,15.73V8.27L15.73,3Z" />
              </svg>
            </button>
            <button
              className="control-button"
              onClick={toggleCollapse}
              title="完全隐藏"
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 折叠状态显示 */}
      {isCollapsed && (
        <div className="collapsed-info animate-fade-in-up">
          {/* 输入变量 */}
          {getInputVariablesInfo().length > 0 && (
            <div className="collapsed-section">
              <div className="collapsed-label">输入:</div>
              {getInputVariablesInfo().map((input, index) => (
                <div key={index} className="collapsed-variable">
                  <span className="var-name">{input.name}</span>
                  <span className="var-type">({input.type})</span>
                </div>
              ))}
            </div>
          )}

          {/* 输出变量 */}
          {getOutputVariablesInfo().length > 0 && (
            <div className="collapsed-section">
              <div className="collapsed-label">输出:</div>
              {getOutputVariablesInfo().map((output, index) => (
                <div key={index} className="collapsed-variable">
                  <span className="var-name">{output.name}</span>
                  <span className="var-type">({output.type})</span>
                </div>
              ))}
            </div>
          )}

          {/* 复制代码按钮 */}
          <button
            className="copy-code-btn"
            onClick={copyCode}
            title="复制代码"
          >
            复制代码
          </button>
        </div>
      )}

      {/* 代码区域 - 只在非折叠状态显示 */}
      {!isCollapsed && (
        <div className="text-node-section text-node-code-section animate-fade-in-up">
          <CodeEditor
            initialText={data.label || ''}
            onTextChange={handleTextChange}
            onExitEdit={handleExitEdit}
            style={{
              minHeight: '100px',
              width: '100%'
            }}
          />
        </div>
      )}

      {/* 错误和警告区域 - 在代码区域下面，输入区域上面 */}
      {!isCollapsed && ((errors.length > 0 || warnings.length > 0) || animatingOut.errors) && (
        <>
          <ErrorDisplay errors={errors} isAnimatingOut={animatingOut.errors} />
          <WarningDisplay warnings={warnings} isAnimatingOut={animatingOut.errors} />
        </>
      )}

      {/* 输入区域 - 只在有变量控件时显示且未隐藏 */}
      {!isCollapsed && (!hiddenSections.inputs || animatingOut.inputs) && controls.length > 0 && (data.showControls !== false) && (
        <div className={`text-node-section text-node-inputs-section ${animatingOut.inputs ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
          <div
            className="section-label clickable"
            onClick={resetInputsToDefault}
            title="点击重置所有输入为默认值"
          >
            Inputs
          </div>
          {controls.map((control, index) => (
            <div key={index} className={`variable-control ${animatingOut.inputs ? 'animate-fade-out-left' : 'animate-fade-in-left'}`} style={{ animationDelay: `${index * 0.1}s` }}>
              <span className="variable-label">{control.name}</span>
              {renderControl(control)}
            </div>
          ))}
        </div>
      )}

      {/* 日志区域 - 在输入区域下面，输出区域上面 */}
      {!isCollapsed && (!hiddenSections.logs || animatingOut.logs) && consoleLogs.length > 0 && (
        <LogDisplay logs={consoleLogs} isAnimatingOut={animatingOut.logs} />
      )}

      {/* 输出区域 - 只在有输出时显示且未隐藏 */}
      {!isCollapsed && (!hiddenSections.outputs || animatingOut.outputs) && Object.keys(outputs).length > 0 && (
        <OutputDisplay outputs={outputs} isAnimatingOut={animatingOut.outputs} />
      )}

      {/* 连接handle - 禁用拖动，只允许点击连接 */}
      <Handle
        type="source"
        position={Position.Right}
        id="main"
        className="text-node-handle"
        isConnectable={activeTool === 'connect'}
        isConnectableStart={false} // 禁用拖动开始连接
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          right: 0,
          top: 0,
          transform: 'translate(0, 0)',    // these 3 styles overrides xyflow's default positionings
          pointerEvents: 'none' // 禁用所有鼠标事件，防止拖动
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="main"
        className="text-node-handle"
        isConnectable={activeTool === 'connect'}
        isConnectableStart={false} // 禁用拖动开始连接
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          left: 0,
          top: 0,
          transform: 'translate(0, 0)',    // these 3 styles overrides xyflow's default positionings
          pointerEvents: 'none' // 禁用所有鼠标事件，防止拖动
        }}
      />

      {/* 节点宽度调整控制 - 仅在选中且非折叠时显示 */}
      {selected && !isCollapsed && (
        <>
          {/* 左侧调整控制 */}
          <NodeResizeControl
            style={{
              background: 'transparent',
              border: 'none',
              width: '8px',
              height: '100%',
              borderRadius: 0,
              cursor: 'ew-resize'
            }}
            position="left"
            minWidth={200}
            onResize={(_event, data) => {
              // 更新节点数据中的宽度
              updateNodeData({ width: data.width });
            }}
          />
          {/* 右侧调整控制 */}
          <NodeResizeControl
            style={{
              background: 'transparent',
              border: 'none',
              width: '8px',
              height: '100%',
              borderRadius: 0,
              cursor: 'ew-resize'
            }}
            position="right"
            minWidth={200}
            onResize={(_event, data) => {
              // 更新节点数据中的宽度
              updateNodeData({ width: data.width });
            }}
          />
        </>
      )}
    </div>
  );
};

export default TextNode;