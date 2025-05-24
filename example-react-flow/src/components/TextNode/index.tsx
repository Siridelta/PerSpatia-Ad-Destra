import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizeControl, useReactFlow } from '@xyflow/react';
import './styles.css';
import { juliaApi, JuliaVariableInfo } from '../../services/juliaApi';
import VariableControls from '../VariableControls';

export type TextNodeData = {
  label: string;
  result?: string;
  initialEditing?: boolean;
  variables?: VariableInfo[];
  showControls?: boolean;
  outputs?: string[];
  consoleLogs?: string[];
  constants?: Record<string, any>; // 存储计算的常量值
};

export interface VariableInfo {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'range' | 'unknown';
  value: any;
  defaultValue: any;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
  isUserDefined: boolean; // 区分手动标记和自动检测
}

export type TextNodeType = Node<TextNodeData, 'text'>;

// 宽度上下限常量
const TEXT_NODE_MIN_WIDTH = 150;
const TEXT_NODE_MAX_WIDTH = 800;

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

// 转换Julia变量信息到本地格式
function convertJuliaVariable(juliaVar: JuliaVariableInfo): VariableInfo {
  let value = juliaVar.value;
  let defaultValue = juliaVar.default_value;
  
  // 确保数值类型的变量值是数字类型
  if (juliaVar.type === 'number' || juliaVar.type === 'range') {
    value = typeof value === 'string' ? parseFloat(value) : value;
    defaultValue = typeof defaultValue === 'string' ? parseFloat(defaultValue) : defaultValue;
    
    // 如果转换失败，使用默认值
    if (isNaN(value)) value = 0;
    if (isNaN(defaultValue)) defaultValue = 0;
  }
  
  return {
    name: juliaVar.name,
    type: juliaVar.type,
    value: value,
    defaultValue: defaultValue,
    constraints: juliaVar.constraints,
    isUserDefined: juliaVar.is_user_defined,
  };
}

const TextNode: React.FC<NodeProps<TextNodeType>> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');

  // React Flow 实例，用于更新节点数据
  const { setNodes, getNodes, getEdges } = useReactFlow();

  // 变量相关状态
  const [variables, setVariables] = useState<VariableInfo[]>(data.variables || []);
  const [outputs, setOutputs] = useState<string[]>(data.outputs || []);
  const [constants, setConstants] = useState<Record<string, any>>(data.constants || {});
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // 初始化时需要通过 useEffect 来进行一次 isEditing 的状态切换，这样才能触发编辑态 textarea 的自动聚焦。
  useEffect(() => {
    console.log('data.initialEditing', data.initialEditing);
    if (data.initialEditing) {
      setIsEditing(true);
    }
  }, [data.initialEditing]);

  // 获取所有连接节点的输出数据
  const getConnectedNodeData = useCallback(() => {
    const edges = getEdges();
    const nodes = getNodes();
    const connectedData: Record<string, any> = {};
    
    // 找到连接到当前节点的边
    const incomingEdges = edges.filter(edge => edge.target === id);
    
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(node => node.id === edge.source);
      if (sourceNode && sourceNode.data && sourceNode.data.constants) {
        // 从源节点的常量中获取所有值
        const sourceConstants = sourceNode.data.constants as Record<string, any>;
        Object.assign(connectedData, sourceConstants);
      }
    }
    
    console.log('从连接节点获取的数据:', connectedData);
    return connectedData;
  }, [id, getNodes, getEdges]);

  // 执行Julia代码
  const executeCode = useCallback(async (code: string, inputValues: Record<string, any> = {}) => {
    if (!code.trim()) return;
    
    // 如果正在执行，跳过新的执行请求
    if (isExecuting) {
      console.log('代码正在执行中，跳过新的执行请求');
      return;
    }

    console.log('执行Julia代码:', code, '输入值:', inputValues);
    setIsExecuting(true);
    setExecutionError(null);
    setErrorDetails(null);
    setShowErrorDetails(false);

    try {
      // 获取所有连接节点的输出数据
      const connectedInputValues = getConnectedNodeData();
      
      // 合并用户输入值和连接节点的数据
      const allInputValues = { ...connectedInputValues, ...inputValues };
      
      console.log('所有输入值（包括连接数据）:', allInputValues);
      
      const result = await juliaApi.evaluateCode(code, allInputValues);
      
      if (result.success) {
        // 更新变量信息，但保留用户手动设置的值
        const newVariables = result.variables.map(convertJuliaVariable);
        
        // 保留当前用户设置的值，只更新结构信息
        setVariables(prev => {
          const updated = newVariables.map(newVar => {
            const existingVar = prev.find(v => v.name === newVar.name);
            if (existingVar && existingVar.isUserDefined) {
              // 保留用户设置的值，但更新其他属性（如约束条件）
              return {
                ...newVar,
                value: existingVar.value // 保留用户设置的值
              };
            }
            return newVar;
          });
          
          // 只有当变量数组真正发生变化时才更新
          if (JSON.stringify(updated) !== JSON.stringify(prev)) {
            return updated;
          }
          return prev; // 无变化时返回原数组，避免重渲染
        });
        
        // 更新输出变量名
        setOutputs(prev => {
          if (JSON.stringify(result.output_names) !== JSON.stringify(prev)) {
            return result.output_names;
          }
          return prev;
        });
        
        // 更新常量值
        setConstants(prev => {
          if (JSON.stringify(result.constants) !== JSON.stringify(prev)) {
            return result.constants;
          }
          return prev;
        });
        
        // 更新日志
        setConsoleLogs(prev => {
          if (JSON.stringify(result.logs) !== JSON.stringify(prev)) {
            return result.logs;
          }
          return prev;
        });
        
        // 同步到React Flow节点数据，保留用户设置的变量值
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id === id) {
              const updatedVariables = newVariables.map(newVar => {
                const existingVar = variables.find(v => v.name === newVar.name);
                if (existingVar && existingVar.isUserDefined) {
                  return {
                    ...newVar,
                    value: existingVar.value
                  };
                }
                return newVar;
              });
              
              // 检查是否真的需要更新
              const currentData = node.data;
              const needsUpdate = (
                JSON.stringify(updatedVariables) !== JSON.stringify(currentData.variables) ||
                JSON.stringify(result.output_names) !== JSON.stringify(currentData.outputs) ||
                JSON.stringify(result.constants) !== JSON.stringify(currentData.constants) ||
                JSON.stringify(result.logs) !== JSON.stringify(currentData.consoleLogs)
              );
              
              if (needsUpdate) {
                return { 
                  ...node, 
                  data: { 
                    ...node.data, 
                    variables: updatedVariables,
                    outputs: result.output_names,
                    constants: result.constants,
                    consoleLogs: result.logs
                  } 
                };
              }
            }
            return node;
          })
        );
        
        console.log('代码执行成功:', result);
      } else {
        console.error('代码执行失败:', result.error_message);
        setExecutionError(result.error_message);
        setErrorDetails(result.error_details);
      }
    } catch (error) {
      console.error('Julia API调用失败:', error);
      setExecutionError(error instanceof Error ? error.message : '未知错误');
      setErrorDetails(null);
    } finally {
      setIsExecuting(false);
    }
  }, [id, setNodes]);

  // 获取连接到此节点的输入值（单个变量版本，保持兼容性）
  const getInputFromConnectedNodes = useCallback((inputName: string) => {
    const connectedData = getConnectedNodeData();
    return connectedData[inputName] || null;
  }, [getConnectedNodeData]);

  // 处理变量约束参数变化
  const handleVariableConstraintsChange = useCallback((name: string, constraints: { min: number; max: number; step: number }) => {
    console.log('TextNode收到约束更改:', name, constraints);
    
    setVariables(prev => {
      const updated = prev.map(v => 
        v.name === name ? { 
          ...v, 
          constraints,
          // 确保当前值在新的范围内
          value: Math.max(constraints.min, Math.min(constraints.max, v.value))
        } : v
      );
      
      // 同步到React Flow节点数据
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, variables: updated } }
            : node
        )
      );
      
      return updated;
    });
  }, [id, setNodes]);

  // 记录最近一次点击事件，用于进入编辑态时定位光标
  const lastPointerDown = useRef<{ x: number; y: number } | null>(null);
  
  // 记录用户是否正在输入，避免干扰光标位置
  const isUserInputting = useRef(false);
  
  // 记录编辑器是否已经初始化内容
  const editorInitialized = useRef(false);

  // 处理文本变化（contentEditable div）
  const handleDivInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    isUserInputting.current = true;
    setText(e.currentTarget.innerText);
    // 短暂延迟后重置标志，避免其他操作被误认为用户输入
    setTimeout(() => {
      isUserInputting.current = false;
    }, 100);
  }, []);

  // contentEditable div的ref，用于聚焦
  const editorRef = useRef<HTMLDivElement>(null);

  // 退出编辑状态的复用逻辑
  const exitEdit = useCallback(() => {
    setIsEditing(false);
    isUserInputting.current = false; // 退出编辑时重置标志
    editorInitialized.current = false; // 重置初始化标志
    
    // 同步数据到React Flow节点数据
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { 
              ...node, 
              data: { 
                ...node.data, 
                label: text,
                initialEditing: undefined
              } 
            }
          : node
      )
    );
  }, [text, id, setNodes]);

  // 自动聚焦到编辑器
  useEffect(() => {
    // 只有在刚进入编辑模式且用户没有正在输入时才重新定位光标
    if (isEditing && editorRef.current && !isUserInputting.current) {
      const editorElement = editorRef.current;
      
      // 首先设置内容（只在编辑器刚初始化时或内容确实不匹配时）
      if (!editorInitialized.current || editorElement.innerText !== text) {
        editorElement.innerText = text;
        editorInitialized.current = true;
      }
      
      // 聚焦元素
      editorElement.focus();
      
      // 如果有记录的点击位置，尝试定位光标
      if (lastPointerDown.current) {
        const { x, y } = lastPointerDown.current;
        
        setTimeout(() => {
          const placed = placeCaretAtPoint(x, y);
          if (!placed) {
            // 如果定位失败，将光标移到末尾
            const range = document.createRange();
            range.selectNodeContents(editorElement);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 10);
        
        // 清除记录的位置
        lastPointerDown.current = null;
      } else {
        // 没有点击位置，将光标移到末尾（只在初次进入编辑模式时）
        setTimeout(() => {
          const range = document.createRange();
          range.selectNodeContents(editorElement);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }, 10);
      }
    }
  }, [isEditing, text]); // 添加text依赖，但只在必要时设置内容

  // 处理键盘事件
  const handleDivKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitEdit();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      exitEdit();
    }
  }, [exitEdit]);

  // 处理双击事件 - 只保留这一个监听
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 只有在点击代码区域时才进入编辑
    const target = e.target as HTMLElement;
    const isCodeArea = target.closest('.text-node-content') || target.closest('.text-node-editor');
    
    if (isCodeArea && !isEditing) {
      e.preventDefault();
      e.stopPropagation();
      // 记录双击位置
      lastPointerDown.current = { x: e.clientX, y: e.clientY };
      setIsEditing(true);
    }
  }, [isEditing]);

  // 获取变量的当前值（用于显示输出）
  const getVariableValue = useCallback((varName: string) => {
    console.log('获取变量值:', varName, '常量列表:', constants);
    
    // 先查找本地变量
    const variable = variables.find(v => v.name === varName);
    if (variable) {
      console.log('找到本地变量:', variable);
      return variable.value !== undefined ? String(variable.value) : '0';
    }
    
    // 查找计算出的常量
    if (constants[varName] !== undefined) {
      console.log('找到常量值:', constants[varName]);
      return String(constants[varName]);
    }
    
    // 如果本地没有找到，尝试从连接的节点获取
    const connectedValue = getInputFromConnectedNodes(varName);
    if (connectedValue !== null) {
      console.log('找到连接变量值:', connectedValue);
      return String(connectedValue);
    }
    
    console.log('变量未找到，返回默认值');
    return '未定义';
  }, [variables, constants, getInputFromConnectedNodes]);

  // 当变量列表更新时，更新输出显示
  useEffect(() => {
    console.log('变量列表更新:', variables);
    console.log('输出列表:', outputs);
    console.log('常量列表:', constants);
  }, [variables, outputs, constants]);

  // 处理代码复制
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      // 这里可以添加复制成功提示
      console.log('代码已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, [text]);

  // 当代码变化时，重新解析和执行
  useEffect(() => {
    if (!isEditing && text) {
      // 添加延迟执行，避免频繁请求
      const timeoutId = setTimeout(() => {
        // 构建输入变量值的映射
        const inputValues: Record<string, any> = {};
        
        // 添加用户定义的变量值（来自控件）
        variables.forEach(variable => {
          if (variable.isUserDefined) {
            inputValues[variable.name] = variable.value;
          }
        });
        
        // 获取连接节点数据
        const connectedData = getConnectedNodeData();
        
        // 添加从连接节点传来的值
        variables.forEach(variable => {
          if (!variable.isUserDefined) {
            const connectedValue = connectedData[variable.name];
            if (connectedValue !== null && connectedValue !== undefined) {
              // 确保数值类型的变量值是数字类型
              if (variable.type === 'number' || variable.type === 'range') {
                const numValue = typeof connectedValue === 'string' ? parseFloat(connectedValue) : connectedValue;
                inputValues[variable.name] = isNaN(numValue) ? variable.defaultValue : numValue;
              } else {
                inputValues[variable.name] = connectedValue;
              }
            }
          }
        });
        
        // 执行代码
        executeCode(text, inputValues);
      }, 300); // 300ms延迟
      
      return () => clearTimeout(timeoutId);
    }
  }, [text, isEditing]); // 只依赖text和isEditing，避免循环执行

  // 当变量值变化时，重新执行代码
  const handleVariableChange = useCallback((name: string, value: any) => {
    setVariables(prev => {
      const updated = prev.map(v => 
        v.name === name ? { ...v, value } : v
      );
      
      // 同步到React Flow节点数据
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, variables: updated } }
            : node
        )
      );
      
      // 延迟重新执行代码，避免频繁执行
      setTimeout(() => {
        // 重新执行代码
        const inputValues: Record<string, any> = {};
        
        // 获取连接节点数据
        const connectedData = getConnectedNodeData();
        
        // 添加用户定义的变量值（来自控件）
        updated.forEach(variable => {
          if (variable.isUserDefined) {
            inputValues[variable.name] = variable.value;
          }
        });
        
        // 添加从连接节点传来的值
        updated.forEach(variable => {
          if (!variable.isUserDefined) {
            const connectedValue = connectedData[variable.name];
            if (connectedValue !== null && connectedValue !== undefined) {
              // 确保数值类型的变量值是数字类型
              if (variable.type === 'number' || variable.type === 'range') {
                const numValue = typeof connectedValue === 'string' ? parseFloat(connectedValue) : connectedValue;
                inputValues[variable.name] = isNaN(numValue) ? variable.defaultValue : numValue;
              } else {
                inputValues[variable.name] = connectedValue;
              }
            }
          }
        });
        
        executeCode(text, inputValues);
      }, 100); // 100ms延迟，避免频繁执行
      
      return updated;
    });
  }, [id, setNodes, text, executeCode, getConnectedNodeData]);

  return (
    <div
      className={`text-node${selected ? ' selected' : ''}`}
      onDoubleClick={handleDoubleClick}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        cursor: 'text',
      }}
    >
      {/* 左侧宽度调整控制 */}
      <NodeResizeControl
        position="left"
        resizeDirection='horizontal'
        minWidth={TEXT_NODE_MIN_WIDTH}
        maxWidth={TEXT_NODE_MAX_WIDTH}
        style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          width: 8,
          height: '100%',
          background: 'transparent',
          cursor: 'ew-resize',
          zIndex: 10,
          border: 'none',
        }}
      />
      {/* 右侧宽度调整控制 */}
      <NodeResizeControl
        position="right"
        resizeDirection='horizontal'
        minWidth={TEXT_NODE_MIN_WIDTH}
        maxWidth={TEXT_NODE_MAX_WIDTH}
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          width: 8,
          height: '100%',
          background: 'transparent',
          cursor: 'ew-resize',
          zIndex: 10,
          border: 'none',
        }}
      />
      {/* 节点内容 */}
      {/* 执行状态指示器 - 移到代码区顶部 */}
      {!isEditing && isExecuting && (
        <div className="text-node-status-top code-font">
          ⏳ 执行中...
        </div>
      )}
      
      {isEditing ? (
        <div
          className="text-node-editor nodrag code-font"
          key="text"
          contentEditable
          ref={editorRef}
          suppressContentEditableWarning
          onInput={handleDivInput}
          onBlur={exitEdit}
          onKeyDown={handleDivKeyDown}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: '1em', outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all', cursor: 'text' }}
          spellCheck={false}
        />
      ) : (
        <div key="display" className="text-node-content code-font" style={{ width: '100%', boxSizing: 'border-box', position: 'relative' }}>
          {text && (
            <button 
              className="copy-code-btn"
              onClick={handleCopyCode}
              title="复制代码"
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: 'rgba(0,0,0,0.1)',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '12px',
                color: '#fff',
                cursor: 'pointer',
                opacity: 0.6,
                zIndex: 10
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              📋
            </button>
          )}
          {text ? (
            <pre>{text}</pre>
          ) : (
            <pre style={{ color: 'rgba(160, 236, 255, 0.35)' }}>// 在此输入Julia代码</pre>
          )}
        </div>
      )}
      
      {/* 只在非编辑模式下显示结果 */}
      {!isEditing && data.result && (
        <>
          <div className="text-node-divider" />
          <div className="text-node-result code-font">
            {data.result}
          </div>
        </>
      )}
      
      {/* 只在非编辑模式下显示错误信息 */}
      {!isEditing && executionError && (
        <>
          <div className="text-node-divider" />
          <div className="text-node-error code-font">
            <div 
              className="error-summary" 
              onClick={() => errorDetails && setShowErrorDetails(!showErrorDetails)}
              style={{ 
                cursor: errorDetails ? 'pointer' : 'default'
              }}
            >
              <span>❌ {executionError}</span>
              {errorDetails && (
                <span style={{ 
                  fontSize: '9px', 
                  color: 'rgba(255, 99, 99, 0.6)',
                  marginLeft: '8px'
                }}>
                  {showErrorDetails ? '▼' : '▶'}
                </span>
              )}
            </div>
            {errorDetails && showErrorDetails && (
              <div className="error-details">
                {errorDetails}
              </div>
            )}
          </div>
        </>
      )}
      
      {/* 输出变量区 */}
      {!isEditing && outputs.length > 0 && (
        <>
          <div className="text-node-divider" />
          <div className="text-node-outputs code-font">
            {outputs.map((output, index) => (
              <div key={index} className="output-variable">
                <span className="output-label">@output</span> {output}: <span className="output-value">{getVariableValue(output)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      
      {/* Console.log 输出区 - 移到输出和控件之间 */}
      {!isEditing && consoleLogs.length > 0 && (
        <>
          <div className="text-node-divider" />
          <div className="text-node-logs code-font">
            {consoleLogs.map((log, index) => (
              <div key={index} className="log-entry">
                {log}
              </div>
            ))}
          </div>
        </>
      )}
      
      {/* 变量控件区 */}
      {!isEditing && variables.length > 0 && (data.showControls !== false) && (
        <VariableControls
          variables={variables}
          onVariableChange={handleVariableChange}
          onVariableConstraintsChange={handleVariableConstraintsChange}
          className="nodrag"
        />
      )}
      
      {/* 始终隐藏 handle，因为已移除连接功能 */}
      <Handle
        type="source"
        position={Position.Right}
        id="main"
        className="text-node-handle hide-handle"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="main"
        className="text-node-handle hide-handle"
        isConnectable={false}
        isConnectableStart={false}
      />
    </div>
  );
};

export default TextNode;