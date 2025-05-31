import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import './styles.css';
import { jsExecutor, ControlInfo, ExecutionResult } from '../../services/jsExecutor';

export type TextNodeData = {
  label: string;
  result?: string;
  initialEditing?: boolean;
  controls?: ControlInfo[];
  showControls?: boolean;
  outputs?: Record<string, any>;
  consoleLogs?: string[];
  constants?: Record<string, any>; // 存储计算的常量值
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
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');
  const [showSections, setShowSections] = useState(true); // 控制卡片显示/隐藏

  // React Flow 实例，用于更新节点数据
  const { setNodes, getNodes, getEdges } = useReactFlow();

  // 变量相关状态
  const [controls, setControls] = useState<ControlInfo[]>(data.controls || []);
  const [outputs, setOutputs] = useState<Record<string, any>>(data.outputs || {});
  const [consoleLogs, setConsoleLogs] = useState<string[]>(data.consoleLogs || []);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // 控件值状态
  const [controlValues, setControlValues] = useState<Record<string, any>>({});
  
  // 滑动条编辑状态
  const [editingSlider, setEditingSlider] = useState<string | null>(null);
  const [sliderSettings, setSliderSettings] = useState<{
    min: number;
    max: number;
    step: number;
  }>({ min: 0, max: 100, step: 1 });

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
      if (sourceNode && sourceNode.data && sourceNode.data.outputs) {
        // 从源节点的输出中获取所有值
        const sourceOutputs = sourceNode.data.outputs as Record<string, any>;
        Object.assign(connectedData, sourceOutputs);
      }
    }
    
    console.log('从连接节点获取的数据:', connectedData);
    return connectedData;
  }, [id, getNodes, getEdges]);

  // 执行JS代码
  const executeCode = useCallback(async (code: string, inputValues: Record<string, any> = {}) => {
    if (!code.trim()) return;
    
    // 如果正在执行，跳过新的执行请求
    if (isExecuting) {
      console.log('代码正在执行中，跳过新的执行请求');
      return;
    }

    console.log('执行JS代码:', code, '输入值:', inputValues);
    setIsExecuting(true);

    try {
      // 获取所有连接节点的输出数据
      const connectedInputValues = getConnectedNodeData();
      
      // 合并用户输入值和连接节点的数据
      const allInputValues = { ...connectedInputValues, ...inputValues };
      
      console.log('所有输入值（包括连接数据）:', allInputValues);
      
      const result = await jsExecutor.executeCode(code, allInputValues);
      
      if (result.success) {
        // 更新控件信息
        setControls(result.controls);
        
        // 更新输出
        setOutputs(result.outputs);
        
        // 更新日志
        setConsoleLogs(result.logs);
        
        // 同步到React Flow节点数据
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id === id) {
              return { 
                ...node, 
                data: { 
                  ...node.data, 
                  controls: result.controls,
                  outputs: result.outputs,
                  consoleLogs: result.logs
                } 
              };
            }
            return node;
          })
        );
        
        console.log('代码执行成功:', result);
      } else {
        console.error('代码执行失败:', result.error);
      }
    } catch (error) {
      console.error('JS代码执行失败:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [id, setNodes, isExecuting, getConnectedNodeData]);

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
  }, [text, isEditing, controlValues, executeCode, getConnectedNodeData]);

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

  // 渲染开关控件的函数
  const renderToggleControl = (control: ControlInfo) => {
    const currentValue = controlValues[control.name] ?? control.defaultValue;
    const isActive = Boolean(currentValue);
    
    // 处理开关点击
    const handleToggleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleVariableChange(control.name, !currentValue);
    };
    
    return (
      <div className="toggle-container nodrag">
        <div 
          className={`toggle-switch ${isActive ? 'active' : ''}`}
          onClick={handleToggleClick}
        >
          <div className="toggle-knob"></div>
        </div>
        <span className="toggle-text">{isActive ? 'true' : 'false'}</span>
      </div>
    );
  };

  // 渲染滑动条控件的函数
  const renderSliderControl = (control: ControlInfo) => {
    const min = control.min ?? 0;
    const max = control.max ?? 100;
    const step = control.step ?? 1;
    const currentValue = controlValues[control.name] ?? control.defaultValue ?? 0;
    const progress = ((currentValue - min) / (max - min)) * 100;
    
    // 检查是否正在编辑此滑动条的设置
    const isEditingThis = editingSlider === control.name;
    
    // 处理数值点击 - 切换到设置界面
    const handleValueClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isEditingThis) {
        // 如果正在编辑，恢复为滑动条
        setEditingSlider(null);
      } else {
        // 进入编辑模式
        setEditingSlider(control.name);
        setSliderSettings({ min, max, step });
      }
    };
    
    // 处理数值右键清空
    const handleValueRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleVariableChange(control.name, control.defaultValue || 0);
    };

    // 应用滑动条设置
    const applySliderSettings = () => {
      // 更新控件配置
      setControls(prev => prev.map(c => 
        c.name === control.name 
          ? { ...c, min: sliderSettings.min, max: sliderSettings.max, step: sliderSettings.step }
          : c
      ));
      
      // 确保当前值在新范围内
      const newValue = Math.max(sliderSettings.min, Math.min(sliderSettings.max, currentValue));
      if (newValue !== currentValue) {
        handleVariableChange(control.name, newValue);
      }
      
      setEditingSlider(null);
    };

    // 处理滑动条输入变化
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const newValue = parseFloat(e.target.value);
      handleVariableChange(control.name, newValue);
    };

    // 处理鼠标按下事件，防止拖动冲突
    const handleSliderMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    // 如果正在编辑设置，显示设置面板
    if (isEditingThis) {
      return (
        <div className="slider-settings-panel nodrag">
          <div className="slider-settings-row">
            <span>最小</span>
            <input
              type="number"
              value={sliderSettings.min}
              onChange={(e) => setSliderSettings(prev => ({ ...prev, min: parseFloat(e.target.value) || 0 }))}
              className="slider-settings-input"
              placeholder="0"
            />
            <span>-</span>
            <input
              type="number"
              value={sliderSettings.max}
              onChange={(e) => setSliderSettings(prev => ({ ...prev, max: parseFloat(e.target.value) || 100 }))}
              className="slider-settings-input"
              placeholder="100"
            />
            <span>最大</span>
          </div>
          <div className="slider-settings-row">
            <span>步长</span>
            <input
              type="number"
              value={sliderSettings.step}
              onChange={(e) => setSliderSettings(prev => ({ ...prev, step: parseFloat(e.target.value) || 1 }))}
              className="slider-settings-input"
              placeholder="1"
            />
            <button
              onClick={applySliderSettings}
              style={{
                background: '#014a64',
                color: '#ffffff',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '14px'
              }}
            >
              确定
            </button>
          </div>
        </div>
      );
    }

    // 正常的滑动条显示
    return (
      <div className="slider-container nodrag">
        <div className="slider-track" onMouseDown={handleSliderMouseDown}>
          <div 
            className="slider-progress" 
            style={{ width: `${progress}%` }}
          ></div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={currentValue}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            className="slider-input"
          />
        </div>
        <span 
          className="variable-value"
          onClick={handleValueClick}
          onContextMenu={handleValueRightClick}
          style={{ cursor: 'pointer' }}
          title="左键设置范围，右键重置"
        >
          {currentValue}
        </span>
      </div>
    );
  };

  // 渲染文本输入控件的函数
  const renderTextControl = (control: ControlInfo) => {
    const currentValue = controlValues[control.name] ?? control.defaultValue ?? '';
    
    // 处理文本框右键清空
    const handleTextRightClick = (e: React.MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();
      handleVariableChange(control.name, control.defaultValue || '');
    };

    // 处理文本框变化
    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      handleVariableChange(control.name, e.target.value);
    };

    return (
      <div className="text-input-container nodrag">
        <input
          type="text"
          value={currentValue}
          onChange={handleTextChange}
          onContextMenu={handleTextRightClick}
          className="text-input"
          placeholder="输入文本..."
          title="右键清空"
        />
      </div>
    );
  };

  // 渲染输出变量的函数
  const renderOutput = (outputName: string, index: number) => {
    const value = outputs[outputName]; // 直接从outputs获取值
    const valueStr = String(value);
    const type = typeof value;
    const nameLength = outputName.length;
    const shouldWrap = nameLength > 10; // 如果变量名超过10个字符，换行显示
    
    return (
      <div key={index} className={`output-variable ${shouldWrap ? 'wrapped' : ''}`}>
        <span className="output-variable-name">{outputName}</span>
        <div className="output-variable-value">
          <span className="output-variable-type">{type}: </span>
          {valueStr}
        </div>
      </div>
    );
  };

  // 新增：处理Code标签点击事件
  const handleCodeLabelClick = () => {
    setShowSections(!showSections);
  };

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
      {/* 代码区域 */}
      <div className="text-node-section text-node-code-section">
        <div 
          className="section-label clickable" 
          onClick={handleCodeLabelClick}
          style={{ cursor: 'pointer' }}
          title="点击显示/隐藏其他区域"
        >
          Code
        </div>
        {isEditing ? (
          <div
            className="text-node-editor nodrag"
            key="text"
            contentEditable
            ref={editorRef}
            suppressContentEditableWarning
            onInput={handleDivInput}
            onBlur={exitEdit}
            onKeyDown={handleDivKeyDown}
            style={{ 
              width: '100%', 
              boxSizing: 'border-box', 
              minHeight: '1em', 
              outline: 'none', 
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-all', 
              cursor: 'text' 
            }}
            spellCheck={false}
          />
        ) : (
          <div key="display" className="text-node-content" style={{ width: '100%', boxSizing: 'border-box' }}>
            {text ? (
              <pre>{text}</pre>
            ) : (
              <pre style={{ color: 'rgba(125, 225, 234, 0.4)' }}>// 在此输入JS代码</pre>
            )}
          </div>
        )}
      </div>

      {/* 输入区域 - 只在有变量控件时显示 */}
      {!isEditing && showSections && controls.length > 0 && (data.showControls !== false) && (
        <div className="text-node-section text-node-inputs-section">
          <div className="section-label">Inputs</div>
          {controls.map((control, index) => (
            <div key={index} className="variable-control">
              <span className="variable-label">{control.name}</span>
              {control.type === 'switch' && renderToggleControl(control)}
              {control.type === 'slider' && renderSliderControl(control)}
              {control.type === 'input' && renderTextControl(control)}
            </div>
          ))}
        </div>
      )}

      {/* 日志区域 - 在输入区域下面，输出区域上面 */}
      {!isEditing && showSections && consoleLogs.length > 0 && (
        <div className="text-node-section text-node-logs-section">
          <div className="section-label">Logs</div>
          <div className="log-container">
            {consoleLogs.map((log, index) => (
              <div key={index} className="log-entry">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 输出区域 - 只在有输出时显示 */}
      {!isEditing && showSections && Object.keys(outputs).length > 0 && (
        <div className="text-node-section text-node-outputs-section">
          <div className="section-label">Outputs</div>
          {Object.keys(outputs).map((output, index) => renderOutput(output, index))}
        </div>
      )}

      {/* 连接句柄（隐藏） */}
      <Handle
        type="source"
        position={Position.Right}
        id="main"
        className="text-node-handle hide-handle"
        isConnectable={true}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="main"
        className="text-node-handle hide-handle"
        isConnectable={true}
        isConnectableStart={false}
      />
    </div>
  );
};

export default TextNode;