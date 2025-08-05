import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow, NodeResizeControl } from '@xyflow/react';
import './styles.css';
import '@/styles/syntax-highlighting.css';
import { jsExecutor, ControlInfo } from '@/services/jsExecutor';
import { useToolStore } from '@/store/toolStore';
import { SliderControl, ToggleControl, TextControl } from './controls';
import { ErrorDisplay, WarningDisplay, LogDisplay, OutputDisplay } from './displays';
import { useMonacoStyleEditor } from './hooks/useMonacoStyleEditor';
import { useNodeExecution } from './hooks/useNodeExecution';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';

export type TextNodeData = {
  label: string;
  result?: string;
  initialEditing?: boolean;
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
  
  // 使用代码编辑器Hook
  const {
    isEditing,
    text,
    editorRef,
    textareaRef,
    handleInput,
    handleKeyDown,
    handleDoubleClick,
    handleDisplayClick,
    handleBlur,
    highlightedHtml,
    adjustSize,
  } = useMonacoStyleEditor({
    initialText: data.label || '',
    onTextChange: (newText) => {
      // 更新节点数据
      updateNodeData({ label: newText });
      // 检查是否有未保存的更改
      const originalText = data.label || '';
      setHasUnsavedChanges(newText !== originalText);
    },
    onExitEdit: () => {
      // 退出编辑时的处理
      const finalCode = textareaRef.current?.value || text;
      updateNodeData({ 
        label: finalCode,
        initialEditing: undefined
      });
      // 清除未保存状态
      setHasUnsavedChanges(false);
      // 触发代码重新执行
      if (finalCode.trim()) {
        executeCode(finalCode, controlValues);
      }
    },
  });
  
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
      setControls(newControls);
      updateNodeData({ controls: newControls });
    },
    onOutputsChange: (newOutputs) => {
      setOutputs(newOutputs);
      updateNodeData({ outputs: newOutputs });
    },
    onLogsChange: (newLogs) => {
      setConsoleLogs(newLogs);
      updateNodeData({ consoleLogs: newLogs });
    },
    onErrorsChange: (newErrors) => {
      setErrors(newErrors);
      updateNodeData({ errors: newErrors });
    },
    onWarningsChange: (newWarnings) => {
      setWarnings(newWarnings);
      updateNodeData({ warnings: newWarnings });
    },
    getConnectedNodeData,
  });

  // 从data中获取节点宽度，移除最大宽度限制
  const nodeWidth = data.width || 'auto';
  const nodeHeight = data.height || 'auto';

  // 隐藏状态
  const isCollapsed = data.isCollapsed || false;
  const hiddenSections = data.hiddenSections || {};



  // 控件值状态
  const [controlValues, setControlValues] = useState<Record<string, any>>({});
  
  // 未保存状态
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  


  // 初始化控件值
  useEffect(() => {
    const initialValues: Record<string, any> = {};
    controls.forEach(control => {
      if (controlValues[control.name] === undefined) {
        initialValues[control.name] = control.value ?? control.defaultValue;
      }
    });
    if (Object.keys(initialValues).length > 0) {
      setControlValues(prev => ({ ...prev, ...initialValues }));
    }
  }, [controls, controlValues]);

  // 初始化时需要通过 useEffect 来进行一次 isEditing 的状态切换，这样才能触发编辑态 textarea 的自动聚焦。
  useEffect(() => {
    console.log('data.initialEditing', data.initialEditing);
    if (data.initialEditing) {
      // 使用Hook提供的方法进入编辑模式
      // 这里需要调用Hook的enterEditMode方法
      // 注意：Hook内部已经处理了初始编辑状态
    }
  }, [data.initialEditing]);



  /**
   * 调整显示模式下的节点宽度
   */
  const adjustDisplayWidth = useCallback(() => {
    const nodeContainer = document.querySelector(`[data-id="${id}"] .text-node`) as HTMLElement;
    if (!nodeContainer || !text) return;
    
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
    tempElement.textContent = text;
    
    document.body.appendChild(tempElement);
    const contentWidth = tempElement.offsetWidth;
    document.body.removeChild(tempElement);
    
    // 计算节点所需的最小宽度
    const minNodeWidth = Math.max(contentWidth + 60, 300);
    
    // 设置节点容器的宽度
    nodeContainer.style.width = `${minNodeWidth}px`;
    
    console.log('调整显示宽度:', {
      contentWidth,
      minNodeWidth,
      text: text?.substring(0, 50) + '...'
    });
  }, [text, id]);









  // 当变量列表更新时，更新输出显示和日志
  useEffect(() => {
    console.log('变量列表更新:', controls);
    console.log('输出列表:', outputs);
    
    // 如果data中有日志但本地状态没有，同步一下
    if (data.consoleLogs && data.consoleLogs.length > 0 && consoleLogs.length === 0) {
      setConsoleLogs(data.consoleLogs);
    }
  }, [controls, outputs, consoleLogs, data.consoleLogs]);

  // 当代码变化时，重新解析和执行
  useEffect(() => {
    if (!isEditing && text) {
      // 调整显示模式下的宽度
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
        
        // 执行代码
        executeCode(text, inputValues);
      }, 300); // 300ms延迟
      
      return () => clearTimeout(timeoutId);
    }
  }, [text, isEditing, controlValues, executeCode, getConnectedNodeData, adjustDisplayWidth]);

  // 监听上游节点更新事件
  useEffect(() => {
    const handleUpstreamChange = (event: CustomEvent) => {
      const { nodeId, sourceNodeId, timestamp, reason } = event.detail;
      
      // 检查是否是当前节点需要更新
      if (nodeId === id) {
        console.log(`节点 ${id} 收到上游节点 ${sourceNodeId} 的更新通知，原因: ${reason || 'data-change'}，时间戳: ${timestamp}`);
        
        // 重新执行代码
        if (text.trim()) {
          const inputValues: Record<string, any> = { ...controlValues };
          const connectedData = getConnectedNodeData();
          Object.assign(inputValues, connectedData);
          
          console.log(`节点 ${id} 开始重新执行代码，输入数据:`, inputValues);
          executeCode(text, inputValues);
        }
      }
    };

    const handleSaveAllChanges = (event: CustomEvent) => {
      // 检查当前节点是否有未保存的更改
      if (hasUnsavedChanges && text.trim()) {
        console.log(`节点 ${id} 收到全局保存命令，重新执行代码`);
        
        // 清除未保存状态
        setHasUnsavedChanges(false);
        
        // 重新执行代码
        const inputValues: Record<string, any> = { ...controlValues };
        const connectedData = getConnectedNodeData();
        Object.assign(inputValues, connectedData);
        
        executeCode(text, inputValues);
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
  }, [id, text, controlValues, executeCode, getConnectedNodeData, hasUnsavedChanges]);

  // 当变量值变化时，重新执行代码
  const handleVariableChange = useCallback((name: string, value: any) => {
    setControlValues(prev => {
      const updated = { ...prev, [name]: value };
      
      // 同步到React Flow节点数据
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { 
                ...node, 
                data: { 
                  ...node.data, 
                  // 更新控件值到控件信息中
                  controls: controls.map(c => 
                    c.name === name ? { ...c, value } : c
                  )
                } 
              }
            : node
        )
      );
      
      // 延迟重新执行代码
      setTimeout(() => {
        const inputValues = { ...updated };
        const connectedData = getConnectedNodeData();
        Object.assign(inputValues, connectedData);
        executeCode(text, inputValues);
      }, 100);
      
      return updated;
    });
  }, [id, setNodes, text, executeCode, getConnectedNodeData, controls]);

  // 渲染控件的函数
  const renderControl = (control: ControlInfo) => {
    const currentValue = controlValues[control.name] ?? control.defaultValue;
    
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
    const defaultValues: Record<string, any> = {};
    controls.forEach(control => {
      defaultValues[control.name] = control.defaultValue;
    });
    setControlValues(defaultValues);
    // 触发代码重新执行
    if (text.trim()) {
      executeCode(text, defaultValues);
    }
  }, [controls, text]);

  // 复制代码到剪贴板
  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      // 可以添加一个提示消息
    } catch (err) {
      console.error('复制代码失败:', err);
    }
  }, [text]);

  // 获取输入变量信息用于折叠状态显示
  const getInputVariablesInfo = useCallback(() => {
    return controls.map(control => ({
      name: control.name,
      type: control.type,
      value: controlValues[control.name] ?? control.defaultValue
    }));
  }, [controls, controlValues]);

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
      onDoubleClick={isCollapsed ? undefined : handleDoubleClick}
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
          {isEditing ? (
            <div 
              className="syntax-highlight-container nodrag" 
              key="syntax-editor"
              style={{ position: 'relative' }}
            >
              {/* 语法高亮显示层 */}
              <pre 
                className="syntax-highlight-display"
                dangerouslySetInnerHTML={{
                  __html: highlightedHtml
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  padding: '8px',
                  whiteSpace: 'pre-wrap',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  overflow: 'visible',
                  pointerEvents: 'none',
                  zIndex: 1,
                  boxSizing: 'border-box'
                }}
              />
              {/* 1x1 textarea 用于输入 */}
              <textarea
                ref={textareaRef}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '1px',
                  height: '1px',
                  fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  padding: '8px',
                  whiteSpace: 'pre-wrap',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'transparent',
                  caretColor: 'transparent',
                  zIndex: 2,
                  boxSizing: 'border-box',
                  cursor: 'text',
                  overflow: 'hidden',
                  resize: 'none',
                  opacity: 0
                }}
                spellCheck={false}
              />
              {/* 显示层容器 */}
              <div
                ref={editorRef}
                onDoubleClick={handleDoubleClick}
                onClick={handleDisplayClick}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  padding: '8px',
                  whiteSpace: 'pre-wrap',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  zIndex: 1,
                  boxSizing: 'border-box',
                  cursor: 'text',
                  overflow: 'visible',
                  pointerEvents: 'auto'
                }}
              />
            </div>
          ) : (
            <div key="display" className="text-node-content" style={{ width: 'auto', boxSizing: 'border-box' }}>
              {text ? (
                <pre 
                  className="syntax-highlighted-code"
                  dangerouslySetInnerHTML={{
                    __html: highlightedHtml
                  }}
                  style={{
                    fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    margin: 0,
                    padding: 0,
                    whiteSpace: 'pre-wrap',
                    overflow: 'visible'
                  }}
                />
              ) : (
                <pre style={{ 
                  color: 'rgba(125, 225, 234, 0.4)',
                  fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  padding: 0
                }}>// 在此输入JS代码</pre>
              )}
            </div>
          )}
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
          right: '-50%',
          transform: 'translateX(50%)',
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
          left: '-50%',
          transform: 'translateX(-50%)',
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
              left: '-4px',
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
              right: '-4px',
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