import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, NodeResizeControl, useKeyPress } from '@xyflow/react';
import './styles.css';
import '@/styles/syntax-highlighting.css';
import { NodeControls } from '@/services/jsExecutor';
import { useToolStore } from '@/store/toolStore';
import { SliderControl, ToggleControl, TextControl } from './controls';
import { ErrorDisplay, WarningDisplay, LogDisplay, OutputDisplay } from './displays';
import CodeEditor from '../CodeEditor';
import { useNodeEval } from '@/contexts/CanvasEvalContext';
import { useCanvasUIData } from '@/hooks/useCanvasUIData';
import { TextNodeType } from '@/types/canvas';
import { TextNodeData } from '@/types/nodeData';



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

  const { code, controls, nodeName, width, height, autoResizeWidth, isCollapsed, hiddenSections } = data;
  const { updateNodeData, updateNodeControlValues } = useCanvasUIData();

  // 从 Eval API 获取节点的计算结果
  const nodeEval = useNodeEval(id);
  const outputs = nodeEval.outputs;
  const consoleLogs = nodeEval.logs;
  const errors = nodeEval.errors;
  const warnings = nodeEval.warnings;
  const isEvaluating = nodeEval.isEvaluating;
  const evaluateNode = nodeEval.evaluate;

  // ============================================================================
  // 状态定义 (按功能分组)
  // ============================================================================

  // UI状态
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState<string>(nodeName);
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
  const nameInputRef = useRef<HTMLInputElement>(null);

  // // 同步 nodeName 到 editingName
  // useEffect(() => {
  //   setEditingName(nodeName);
  // }, [nodeName]);

  // ============================================================================
  // UI交互逻辑 (集中管理)
  // ============================================================================

  // 节点数据更新
  const updateData = useCallback((updates: Partial<TextNodeData>) => {
    updateNodeData(id, updates);
  }, [updateNodeData, id]);

  // 文本变化处理
  const handleTextChange = (newText: string) => {
    updateData({ code: newText });
    const originalText = code || '';
    setHasUnsavedChanges(newText !== originalText);
  };

  // 退出编辑处理
  const handleExitEdit = () => {
    setHasUnsavedChanges(false);
    // const finalCode = data.code || '';
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
    updateData({ nodeName: editingName });
  }, [editingName, updateNodeData]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setEditingName(nodeName);
      setIsEditingName(false);
    }
  }, [handleNameSubmit, nodeName]);

  // 折叠/展开逻辑
  const toggleCollapse = useCallback(() => {
    updateData({ isCollapsed: !isCollapsed });
  }, [isCollapsed, updateNodeData]);

  // 区域显示/隐藏逻辑
  const toggleHideSection = useCallback((section: 'inputs' | 'outputs' | 'logs' | 'errors') => {
    const currentHiddenSections = hiddenSections;
    const isCurrentlyVisible = currentHiddenSections[section];

    if (isCurrentlyVisible) {
      setAnimatingOut(prev => ({ ...prev, [section]: true }));
      setTimeout(() => {
        const newHiddenSections = { ...currentHiddenSections, [section]: true };
        updateData({ hiddenSections: newHiddenSections });
        setAnimatingOut(prev => ({ ...prev, [section]: false }));
      }, 300);
    } else {
      const newHiddenSections = { ...currentHiddenSections, [section]: false };
      updateData({ hiddenSections: newHiddenSections });
    }
  }, [hiddenSections, updateData]);

  // 重置输入到默认值
  const resetInputsToDefault = useCallback(() => {
    const defaultValues = controls.reduce<Record<string, unknown>>((acc, control) => {
      acc[control.name] = control.defaultValue;
      return acc;
    }, {});
    updateNodeControlValues(id, defaultValues);
  }, [controls, updateNodeControlValues, id]);

  // 复制代码
  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code || '');
    } catch (err) {
      console.error('复制代码失败:', err);
    }
  }, [code]);

  const handleVariableChange = useCallback((name: string, value: unknown) => {
    updateNodeControlValues(id, { [name]: value });
  }, [updateNodeControlValues, id]);

  // ============================================================================
  // 动画管理逻辑 (集中管理)
  // ============================================================================

  // 监听代码变化, 自动调整节点宽度
  useEffect(() => {
    const currentText = code || '';
    if (currentText) {
      // 自动调整节点宽度
      setTimeout(() => {
        // 节点宽度调整逻辑
        if (!autoResizeWidth) return;

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

        updateData({ width: minNodeWidth });

        console.log('自动调整节点宽度:', {
          contentWidth,
          minNodeWidth,
          text: currentText?.substring(0, 50) + '...'
        });
      }, 100);
    }
  }, [code, width, updateData, autoResizeWidth]);

  // ============================================================================
  // 渲染函数 (按区域分组)
  // ============================================================================

  // 渲染控件
  const renderControl = (control: NodeControls) => {
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

  const evalControlType = (control: NodeControls) => {
    switch (control.type) {
      case 'slider':
        return 'number';
      case 'input':
        return 'string';
      case 'switch':
        return 'boolean';
      default:
        return '';
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

  const widthStyle = (width && typeof width === 'number') ? `${width}px` : 'auto';
  const heightStyle: string | number | undefined = height || 'auto';

  // ------------------
  // 按住 Ctrl 键，强制进入全部位可拖动状态
  // ------------------
  // 使用 React Flow 的内置按键监听 hook，避免手动注册全局事件
  const isCtrlPressed = useKeyPress('Control');

  // ============================================================================
  // 渲染JSX
  // ============================================================================

  return (
    <div
      className={`text-node${selected ? ' selected' : ''}${isCollapsed ? ' collapsed' : ''}`}
      style={{
        ...(widthStyle !== 'auto' && { width: widthStyle }),
        height: heightStyle,
        boxSizing: 'border-box',
        // cursor: isCollapsed ? 'default' : 'text',
        minWidth: isCollapsed ? '200px' : '300px',
        pointerEvents: isCtrlPressed ? 'none' : 'auto'
      }}
    >
      {/* 节点头部 */}
      <div className="text-node-header">
        <div className="text-node-name-section">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              className={`text-node-name-input ${isCtrlPressed ? 'drag' : 'nodrag'}`}
              value={editingName || ''}
              onChange={(e) => setEditingName(e.target.value)}
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
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title={isCollapsed ? '点击展开节点' : '双击编辑名称'}
            >
              {nodeName || '未命名节点'}
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
            className={isCtrlPressed ? 'drag' : 'nodrag'}
            initialText={code || ''}
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
      {!isCollapsed && (!hiddenSections.inputs || animatingOut.inputs) && controls.length > 0 && (
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
              <span className="output-variable-name">{control.name}</span>
              <span className="output-variable-type">:{evalControlType(control)}</span>
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
        <OutputDisplay
          outputs={outputs}
          isAnimatingOut={animatingOut.outputs}
          nodeId={id}
        />
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
              updateData({ width: data.width, autoResizeWidth: false });
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
              updateData({ width: data.width, autoResizeWidth: false });
            }}
          />
        </>
      )}
    </div>
  );
};

export default TextNode;