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

// ============================================================================
// 类型定义
// ============================================================================

export type TextNodeData = {
  label: string;
  result?: string;
  controls?: ControlInfo[];
  showControls?: boolean;
  outputs?: Record<string, any>;
  consoleLogs?: string[];
  constants?: Record<string, any>;
  width?: number;
  height?: number;
  nodeName?: string;
  isCollapsed?: boolean;
  hiddenSections?: {
    inputs?: boolean;
    outputs?: boolean;
    logs?: boolean;
    errors?: boolean;
  };
  errors?: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>;
  warnings?: Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>;
};

export type TextNodeType = Node<TextNodeData, 'text'>;

// ============================================================================
// 工具函数
// ============================================================================

// 将光标定位到指定页面坐标
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

// ============================================================================
// 主组件
// ============================================================================

const TextNode: React.FC<NodeProps<TextNodeType>> = ({ id, data, selected }) => {
  // ============================================================================
  // 状态定义 (按功能分组)
  // ============================================================================

  // UI状态
  const [isEditingName, setIsEditingName] = useState(false);
  const [nodeName, setNodeName] = useState(data.nodeName || '未命名节点');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 动画状态
  const [animatingOut, setAnimatingOut] = useState<{
    inputs?: boolean;
    outputs?: boolean;
    logs?: boolean;
    errors?: boolean;
  }>({});
  
  // ============================================================================
  // 外部状态和工具
  // ============================================================================
  
  const activeTool = useToolStore((state) => state.activeTool);
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // 节点执行相关逻辑
  // ============================================================================

  // 获取连接节点数据
  const getConnectedNodeData = useCallback(() => {
    const edges = getEdges();
    const nodes = getNodes();
    const connectedData: Record<string, any> = {};
    
    const incomingEdges = edges.filter(edge => edge.target === id);
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(node => node.id === edge.source);
      if (sourceNode && sourceNode.data && sourceNode.data.outputs) {
        const sourceOutputs = sourceNode.data.outputs as Record<string, any>;
        Object.assign(connectedData, sourceOutputs);
      }
    }
    
    console.log('从连接节点获取的数据:', connectedData);
    return connectedData;
  }, [id, getNodes, getEdges]);
  
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
    onControlsChange: (newControls) => updateNodeData({ controls: newControls }),
    onOutputsChange: (newOutputs) => updateNodeData({ outputs: newOutputs }),
    onLogsChange: (newLogs) => updateNodeData({ consoleLogs: newLogs }),
    onErrorsChange: (newErrors) => updateNodeData({ errors: newErrors }),
    onWarningsChange: (newWarnings) => updateNodeData({ warnings: newWarnings }),
    getConnectedNodeData,
  });

  // derived, but independent state
  const [controlValues, _setControlValues] = useState<Record<string, any>>({});

  const setControlValues = useCallback((values: Record<string, any>) => {
    console.log('setControlValues', values);
    const newControls = controls.map((c: ControlInfo) => ({
      ...c,
      value: values[c.name] ?? c.defaultValue
    }));
    console.log('setControls', controls, newControls);
    setControls(newControls);
  }, [controls, setControls]);

  // 通过 useEffect 管理 controlValues 的更新，进行精确的数据比较
  useEffect(() => {
    const newControlValues = controls.reduce((acc, control) => {
      acc[control.name] = control.value ?? control.defaultValue;
      return acc;
    }, {} as Record<string, any>);

    // 比较新旧值是否真正发生了变化
    const hasChanged = Object.keys(newControlValues).some(key =>
      newControlValues[key] !== controlValues[key]
    ) || Object.keys(controlValues).some(key =>
      !(key in newControlValues)
    );
    if (hasChanged) {
      console.log('controlValues has changed', newControlValues);
      _setControlValues(newControlValues);
    }
  }, [controls, controlValues, _setControlValues]);

  // 使用 useRef 存储 executeCode 的最新实例，避免依赖循环
  const executeCodeRef = useRef(executeCode);
  executeCodeRef.current = executeCode;


  // ============================================================================
  // 代码执行逻辑, 响应式更新逻辑 (集中管理)
  // ============================================================================

  // 上游节点变化监听, 重新执行代码
  useEffect(() => {
    const handleUpstreamChange = (event: CustomEvent) => {
      const { nodeId, sourceNodeId, timestamp, reason } = event.detail;

      if (nodeId === id) {
        console.log(`节点 ${id} 收到上游节点 ${sourceNodeId} 的更新通知，原因: ${reason || 'data-change'}，时间戳: ${timestamp}`);

        const currentText = data.label || '';
        if (currentText.trim()) {
          executeCodeRef.current(currentText);
        }
      }
    };

    const handleSaveAllChanges = (event: CustomEvent) => {
      const currentText = data.label || '';
      if (hasUnsavedChanges && currentText.trim()) {
        console.log(`节点 ${id} 收到全局保存命令，重新执行代码`);
        setHasUnsavedChanges(false);
        executeCodeRef.current(currentText);
      }
    };

    document.addEventListener('node-upstream-changed', handleUpstreamChange as EventListener);
    document.addEventListener('save-all-changes', handleSaveAllChanges as EventListener);

    return () => {
      document.removeEventListener('node-upstream-changed', handleUpstreamChange as EventListener);
      document.removeEventListener('save-all-changes', handleSaveAllChanges as EventListener);
    };
  }, [id, data.label, hasUnsavedChanges]);

  // 监听 controlValues 和代码内容变化，重新执行代码
  useEffect(() => {
    const currentText = data.label || '';
    if (currentText.trim()) {
      executeCodeRef.current(currentText);
    }
  }, [controlValues, data.label]); // 不依赖 executeCode，避免循环

  // 监听代码变化, 自动调整节点宽度
  useEffect(() => {
    const currentText = data.label || '';
    if (currentText) {
      // 自动调整节点宽度
      setTimeout(() => {
        // 节点宽度调整逻辑
    if (data.width && typeof data.width === 'number') return;
    
    const nodeContainer = document.querySelector(`[data-id="${id}"] .text-node`) as HTMLElement;
    if (!nodeContainer || !currentText) return;
    
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
    
    const minNodeWidth = Math.max(contentWidth + 60, 300);
    
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
      }, 100);
    }
  }, [data.label, data.width, id, setNodes]);

  // ============================================================================
  // UI交互逻辑 (集中管理)
  // ============================================================================

  // 节点数据更新
  const updateNodeData = useCallback((updates: Partial<TextNodeData>) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  }, [id, setNodes]);

  // 文本变化处理
  const handleTextChange = (newText: string) => {
    updateNodeData({ label: newText });
    const originalText = data.label || '';
    setHasUnsavedChanges(newText !== originalText);
  };

  // 退出编辑处理
  const handleExitEdit = () => {
    setHasUnsavedChanges(false);
    // const finalCode = data.label || '';
    // if (finalCode.trim()) {
    //   executeCode(finalCode);
    // }
  };

  // 节点名称编辑
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

  // 折叠/展开逻辑
  const toggleCollapse = useCallback(() => {
    updateNodeData({ isCollapsed: !data.isCollapsed });
  }, [data.isCollapsed, updateNodeData]);

  // 区域显示/隐藏逻辑
  const toggleHideSection = useCallback((section: 'inputs' | 'outputs' | 'logs' | 'errors') => {
    const hiddenSections = data.hiddenSections || {};
    const isCurrentlyVisible = !hiddenSections[section];

    if (isCurrentlyVisible) {
      setAnimatingOut(prev => ({ ...prev, [section]: true }));
      setTimeout(() => {
        const newHiddenSections = { ...hiddenSections, [section]: true };
        updateNodeData({ hiddenSections: newHiddenSections });
        setAnimatingOut(prev => ({ ...prev, [section]: false }));
      }, 300);
    } else {
      const newHiddenSections = { ...hiddenSections, [section]: false };
      updateNodeData({ hiddenSections: newHiddenSections });
    }
  }, [data.hiddenSections, updateNodeData]);

  // 重置输入到默认值
  const resetInputsToDefault = useCallback(() => {
    const defaultValues = controls.reduce((acc, control) => {
      acc[control.name] = control.defaultValue;
      return acc;
    }, {} as Record<string, any>);
    setControlValues(defaultValues);
  }, [controls, setControlValues]);

  // 复制代码
  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.label || '');
    } catch (err) {
      console.error('复制代码失败:', err);
    }
  }, [data.label]);

  // 变量值变化处理
  const handleVariableChange = useCallback((name: string, value: any) => {
    const updatedValues = { ...controlValues, [name]: value };
    setControlValues(updatedValues);
  }, [setControlValues, controlValues]);

  // ============================================================================
  // 动画管理逻辑 (集中管理)
  // ============================================================================

  // 节点宽度调整逻辑已内联到useEffect中

  // ============================================================================
  // 渲染函数 (按区域分组)
  // ============================================================================

  // 渲染控件
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

  // 获取输入变量信息
  const inputVarsInfo = controls.map(control => ({
      name: control.name,
      type: control.type,
    value: control.value ?? control.defaultValue
    }));

  // 获取输出变量信息
  const outputVarsInfo = Object.entries(outputs).map(([name, value]) => ({
      name,
      type: typeof value,
      value
    }));

  // ============================================================================
  // 计算属性
  // ============================================================================

  const nodeWidth = data.width || 'auto';
  const nodeHeight = data.height || 'auto';
  const isCollapsed = data.isCollapsed || false;
  const hiddenSections = data.hiddenSections || {};

  // ============================================================================
  // 渲染JSX
  // ============================================================================

  return (
    <div
      className={`text-node${selected ? ' selected' : ''}${isCollapsed ? ' collapsed' : ''}`}
      style={{
        ...(nodeWidth !== 'auto' && { width: `${nodeWidth}px` }),
        height: nodeHeight,
        boxSizing: 'border-box',
        cursor: isCollapsed ? 'default' : 'text',
        minWidth: isCollapsed ? '200px' : '300px',
      }}
    >
      {/* 节点头部 */}
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
        
        {/* 控制按钮 */}
        {isCollapsed ? (
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
          {inputVarsInfo.length > 0 && (
            <div className="collapsed-section">
              <div className="collapsed-label">输入:</div>
              {inputVarsInfo.map((input, index) => (
                <div key={index} className="collapsed-variable">
                  <span className="var-name">{input.name}</span>
                  <span className="var-type">({input.type})</span>
                </div>
              ))}
            </div>
          )}
          
          {outputVarsInfo.length > 0 && (
            <div className="collapsed-section">
              <div className="collapsed-label">输出:</div>
              {outputVarsInfo.map((output, index) => (
                <div key={index} className="collapsed-variable">
                  <span className="var-name">{output.name}</span>
                  <span className="var-type">({output.type})</span>
                </div>
              ))}
            </div>
          )}
          
          <button 
            className="copy-code-btn"
            onClick={copyCode}
            title="复制代码"
          >
            复制代码
          </button>
        </div>
      )}

      {/* 代码区域 */}
      {!isCollapsed && (
        <div className="text-node-section text-node-code-section animate-fade-in-up">
          <CodeEditor
            initialText={data.label || ''}
            onTextChange={handleTextChange}
            onExitEdit={handleExitEdit}
            style={{
              width: '100%'
            }}
          />
        </div>
      )}

      {/* 错误和警告区域 */}
      {!isCollapsed && ((errors.length > 0 || warnings.length > 0) || animatingOut.errors) && (
        <>
          <ErrorDisplay errors={errors} isAnimatingOut={animatingOut.errors} />
          <WarningDisplay warnings={warnings} isAnimatingOut={animatingOut.errors} />
        </>
      )}

      {/* 输入区域 */}
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

      {/* 日志区域 */}
      {!isCollapsed && (!hiddenSections.logs || animatingOut.logs) && consoleLogs.length > 0 && (
        <LogDisplay logs={consoleLogs} isAnimatingOut={animatingOut.logs} />
      )}

      {/* 输出区域 */}
      {!isCollapsed && (!hiddenSections.outputs || animatingOut.outputs) && Object.keys(outputs).length > 0 && (
        <OutputDisplay outputs={outputs} isAnimatingOut={animatingOut.outputs} />
      )}

      {/* 连接handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="main"
        className="text-node-handle"
        isConnectable={activeTool === 'connect'}
        isConnectableStart={false}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          right: 0,
          top: 0,
          transform: 'translate(0, 0)',
          pointerEvents: 'none'
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="main"
        className="text-node-handle"
        isConnectable={activeTool === 'connect'}
        isConnectableStart={false}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          left: 0,
          top: 0,
          transform: 'translate(0, 0)',
          pointerEvents: 'none'
        }}
      />
      
      {/* 节点宽度调整控制 */}
      {!isCollapsed && (
        <>
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
              updateNodeData({ width: data.width });
            }}
          />
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
              updateNodeData({ width: data.width });
            }}
          />
        </>
      )}
    </div>
  );
};

export default TextNode;