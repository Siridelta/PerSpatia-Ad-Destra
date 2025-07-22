import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow, NodeResizeControl } from '@xyflow/react';
import './styles.css';
import '../../styles/syntax-highlighting.css';
import { jsExecutor, ControlInfo } from '../../services/jsExecutor';
import { useToolStore } from '../../store/toolStore';
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
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');
  const [isEditingName, setIsEditingName] = useState(false); // 是否在编辑节点名称
  const [nodeName, setNodeName] = useState(data.nodeName || '未命名节点');
  
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

  // 编辑器元素引用
  const textElementRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 从data中获取节点宽度，移除最大宽度限制
  const nodeWidth = data.width || 'auto';
  const nodeHeight = data.height || 'auto';

  // 隐藏状态
  const isCollapsed = data.isCollapsed || false;
  const hiddenSections = data.hiddenSections || {};

  /**
   * 生成语法高亮的HTML
   * @param code 要高亮的代码
   * @returns 高亮后的HTML字符串
   */
  const generateHighlightedCode = useCallback((code: string): string => {
    if (!code.trim()) return '';
    
    try {
      // 直接使用Prism进行语法高亮，不需要手动转义
      const highlighted = Prism.highlight(code, Prism.languages.javascript, 'javascript');
      return highlighted;
    } catch (error) {
      console.warn('语法高亮失败:', error);
      // 回退到转义后的纯文本
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }, []);

  /**
   * 自动调整编辑器尺寸以适应内容
   */
  const adjustEditorSize = useCallback(() => {
    if (!textElementRef.current) return;
    
    const editor = textElementRef.current;
    const container = editor.parentElement;
    const highlightDisplay = container?.querySelector('.syntax-highlight-display') as HTMLElement;
    const nodeContainer = container?.closest('.text-node') as HTMLElement;
    
    if (!container || !highlightDisplay || !nodeContainer) return;
    
    // 重置高度以获取真实的scrollHeight
    editor.style.height = 'auto';
    highlightDisplay.style.height = 'auto';
    container.style.height = 'auto';
    
    // 计算所需高度（至少100px）
    const scrollHeight = Math.max(editor.scrollHeight, 100);
    const newHeight = `${scrollHeight}px`;
    
    // 设置高度
    editor.style.height = newHeight;
    highlightDisplay.style.height = newHeight;
    container.style.height = newHeight;
    
    // 计算内容所需的宽度
    // 创建一个临时元素来测量文本宽度
    const tempElement = document.createElement('pre');
    // tempElement.style.fontFamily = 'JetBrains Mono, monospace';
    tempElement.style.fontSize = '14px';
    tempElement.style.lineHeight = '1.5';
    tempElement.style.whiteSpace = 'pre';
    tempElement.style.position = 'absolute';
    tempElement.style.visibility = 'hidden';
    tempElement.style.padding = '8px';
    tempElement.style.top = '-9999px';
    tempElement.style.left = '-9999px';
    tempElement.textContent = text || '// 在此输入JS代码';
    
    document.body.appendChild(tempElement);
    const contentWidth = tempElement.offsetWidth;
    document.body.removeChild(tempElement);
    
    // 计算节点所需的最小宽度（内容宽度 + padding + margin）
    const minNodeWidth = Math.max(contentWidth + 60, 300); // 60px for padding and margins
    
    // 设置节点容器的宽度
    nodeContainer.style.width = `${minNodeWidth}px`;
    
    console.log('调整编辑器尺寸:', {
      contentWidth,
      minNodeWidth,
      scrollHeight,
      newHeight,
      text: text?.substring(0, 50) + '...'
    });
  }, [text]);

  // 变量相关状态
  const [controls, setControls] = useState<ControlInfo[]>(data.controls || []);
  const [outputs, setOutputs] = useState<Record<string, any>>(data.outputs || {});
  const [consoleLogs, setConsoleLogs] = useState<string[]>(data.consoleLogs || []);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // 错误和警告状态
  const [errors, setErrors] = useState<Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>>(data.errors || []);
  const [warnings, setWarnings] = useState<Array<{
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }>>(data.warnings || []);
  
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

  /**
   * 调整显示模式下的节点宽度
   */
  const adjustDisplayWidth = useCallback(() => {
    const nodeContainer = document.querySelector(`[data-id="${id}"] .text-node`) as HTMLElement;
    if (!nodeContainer || !text) return;
    
    // 创建临时元素测量文本宽度
    const tempElement = document.createElement('pre');
    tempElement.style.fontFamily = 'JetBrains Mono, 阿里妈妈方圆体, monospace';
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

  // 执行JS代码
  const executeCode = useCallback(async (code: string, inputValues: Record<string, any> = {}) => {
    if (!code.trim()) {
      // 清空错误状态时添加淡出动画
      if (errors.length > 0 || warnings.length > 0) {
        setAnimatingOut(prev => ({ ...prev, errors: true }));
        setTimeout(() => {
          setErrors([]);
          setWarnings([]);
          setAnimatingOut(prev => ({ ...prev, errors: false }));
        }, 300);
      }
      return;
    }
    
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
        
        // 清空错误和警告时添加淡出动画
        if (errors.length > 0 || warnings.length > 0) {
          setAnimatingOut(prev => ({ ...prev, errors: true }));
          setTimeout(() => {
            setErrors([]);
            setWarnings([]);
            setAnimatingOut(prev => ({ ...prev, errors: false }));
          }, 300);
        } else {
          // 如果之前没有错误，直接清空
          setErrors([]);
          setWarnings([]);
        }
        
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
                  consoleLogs: result.logs,
                  errors: [],
                  warnings: []
                } 
              };
            }
            return node;
          })
        );
        
        console.log('代码执行成功:', result);
      } else {
        console.error('代码执行失败:', result.errors);
        
        // 更新错误状态
        const sortedErrors = (result.errors || []).sort((a: any, b: any) => (a.line || 0) - (b.line || 0));
        setErrors(sortedErrors);
        setWarnings(result.warnings || []);
        
        // 同步到React Flow节点数据
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id === id) {
              return { 
                ...node, 
                data: { 
                  ...node.data, 
                  errors: sortedErrors,
                  warnings: result.warnings || []
                } 
              };
            }
            return node;
          })
        );
      }
    } catch (error) {
      console.error('JS代码执行失败:', error);
      const errorInfo = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      setErrors([errorInfo]);
      
      // 同步到React Flow节点数据
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return { 
              ...node, 
              data: { 
                ...node.data, 
                errors: [errorInfo],
                warnings: []
              } 
            };
          }
          return node;
        })
      );
    } finally {
      setIsExecuting(false);
    }
  }, [id, setNodes, isExecuting, getConnectedNodeData, errors.length, warnings.length]);

  // 记录最近一次点击事件，用于进入编辑态时定位光标
  const lastPointerDown = useRef<{ x: number; y: number } | null>(null);
  
  // 记录用户是否正在输入，避免干扰光标位置
  const isUserInputting = useRef(false);
  
  // 记录编辑器是否已经初始化内容
  const editorInitialized = useRef(false);

  // 处理文本变化（编辑器）
  const handleSyntaxEditorInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    isUserInputting.current = true;
    const currentCode = e.currentTarget.innerText;
    setText(currentCode);
    
    // 实时更新语法高亮显示层
    const highlightDisplay = e.currentTarget.parentElement?.querySelector('.syntax-highlight-display') as HTMLElement;
    if (highlightDisplay) {
      highlightDisplay.innerHTML = generateHighlightedCode(currentCode);
    }
    
    // 自动调整编辑器高度
    setTimeout(() => {
      adjustEditorSize();
    }, 0);
    
    // 延迟执行代码，避免过于频繁的执行
    setTimeout(() => {
      const valuesSnapshot = { ...controlValues };
      executeCode(currentCode, valuesSnapshot);
    }, 300);
    
    // 短暂延迟后重置标志，避免其他操作被误认为用户输入
    setTimeout(() => {
      isUserInputting.current = false;
    }, 100);
  }, [controls, controlValues, executeCode, generateHighlightedCode, adjustEditorSize]);

  // 退出编辑状态的复用逻辑
  const exitEdit = useCallback(() => {
    // 从编辑器元素获取最新代码
    const finalCode = textElementRef.current?.innerText || text;
    setText(finalCode);
    
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
                label: finalCode, // 使用从编辑器获取的代码
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
    if (isEditing && textElementRef.current && !isUserInputting.current) {
      const editorElement = textElementRef.current;
      
      // 首先设置内容（只在编辑器刚初始化时或内容确实不匹配时）
      if (!editorInitialized.current || editorElement.innerText !== text) {
        editorElement.innerText = text;
        editorInitialized.current = true;
        
        // 初始化语法高亮
        const highlightDisplay = editorElement.parentElement?.querySelector('.syntax-highlight-display') as HTMLElement;
        if (highlightDisplay) {
          highlightDisplay.innerHTML = generateHighlightedCode(text);
        }
        
        // 调整编辑器高度
        setTimeout(() => {
          adjustEditorSize();
        }, 0);
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
  }, [isEditing, text, generateHighlightedCode, adjustEditorSize]); // 添加新的依赖项

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

    // 添加事件监听器
    document.addEventListener('node-upstream-changed', handleUpstreamChange as EventListener);
    
    // 清理事件监听器
    return () => {
      document.removeEventListener('node-upstream-changed', handleUpstreamChange as EventListener);
    };
  }, [id, text, controlValues, executeCode, getConnectedNodeData]);

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
        <span 
          className="toggle-text" 
          style={{ color: isActive ? '#28d900' : '#d90000' }}
        >
          {isActive ? 'true' : 'false'}
        </span>
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

    // 处理滑动条释放，移除焦点以恢复键盘响应
    const handleSliderMouseUp = (e: React.MouseEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).blur(); // 移除焦点，恢复键盘响应
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
                fontFamily: 'JetBrains Mono, 阿里妈妈方圆体, monospace',
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
        {/* 显示：最小值 {滑动条} 最大值 值 */}
        <div className="slider-layout">
          <span 
            className="slider-min-value"
            onClick={handleValueClick}
            style={{ cursor: 'pointer', color: '#7de1ea', margin: '0 8px' }}
            title="点击设置范围"
          >
            {min}
          </span>
          <div className="slider-track-wrapper">
            <div className="slider-track" onMouseDown={handleSliderMouseDown} onMouseUp={handleSliderMouseUp}>
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
                onMouseUp={handleSliderMouseUp}
                className="slider-input"
              />
            </div>
          </div>
          <span 
            className="slider-max-value"
            onClick={handleValueClick}
            style={{ cursor: 'pointer', color: '#7de1ea', margin: '0 8px' }}
            title="点击设置范围"
          >
            {max}
          </span>
          <span 
            className="slider-current-value"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // TODO: 实现直接设置数值的功能
              const newValue = prompt(`设置 ${control.name} 的值:`, String(currentValue));
              if (newValue !== null && !isNaN(Number(newValue))) {
                const numValue = Math.max(min, Math.min(max, Number(newValue)));
                handleVariableChange(control.name, numValue);
              }
            }}
            onContextMenu={handleValueRightClick}
            style={{ cursor: 'pointer', color: '#7de1ea' }}
            title="左键直接设置值，右键重置"
          >
            {currentValue}
          </span>
        </div>
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
    
    return (
      <div key={index} className="output-variable">
        <div className="output-left">
          <span className="output-variable-name" style={{ color: '#ffffff' }}>{outputName}</span>
          <span className="output-variable-type" style={{ color: '#091c33' }}>:{type}</span>
        </div>
        <div className="output-right">
          <span className="output-variable-value" style={{ color: '#7de1ea' }}>{valueStr}</span>
        </div>
      </div>
    );
  };

  // 渲染错误卡片
  const renderErrorCard = (error: {
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }, index: number) => {
    return (
      <div key={index} className="error-card animate-fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
        <div className="error-header">
          <span className="error-label">Error</span>
          {error.line && (
            <span className="error-location">行 {error.line}{error.column ? `:${error.column}` : ''}</span>
          )}
        </div>
        <div className="error-message">{error.message}</div>
        {error.stack && (
          <div className="error-stack">
            <details>
              <summary>栈追踪</summary>
              <pre>{error.stack}</pre>
            </details>
          </div>
        )}
      </div>
    );
  };

  // 渲染警告卡片  
  const renderWarningCard = (warning: {
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  }, index: number) => {
    return (
      <div key={index} className="warning-card animate-fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
        <div className="warning-header">
          <span className="warning-label">Warning</span>
          {warning.line && (
            <span className="warning-location">行 {warning.line}{warning.column ? `:${warning.column}` : ''}</span>
          )}
        </div>
        <div className="warning-message">{warning.message}</div>
        {warning.stack && (
          <div className="warning-stack">
            <details>
              <summary>栈追踪</summary>
              <pre>{warning.stack}</pre>
            </details>
          </div>
        )}
      </div>
    );
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
                cursor: isCollapsed ? 'pointer' : 'pointer'
              }}
              title={isCollapsed ? '点击展开节点' : '双击编辑名称'}
            >
              {nodeName}
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
            >
              {/* 语法高亮显示层 */}
              <pre 
                className="syntax-highlight-display"
                dangerouslySetInnerHTML={{
                  __html: generateHighlightedCode(text)
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  fontFamily: 'JetBrains Mono, 阿里妈妈方圆体, monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  padding: '8px',
                  whiteSpace: 'pre-wrap', // 改为pre-wrap，支持自动换行
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  overflow: 'visible', // 保持visible
                  pointerEvents: 'none',
                  zIndex: 1,
                  boxSizing: 'border-box'
                }}
              />
              {/* 可编辑文本层 */}
              <div
                className="text-node-editor"
                contentEditable
                ref={textElementRef}
                suppressContentEditableWarning
                onInput={handleSyntaxEditorInput}
                onBlur={exitEdit}
                onKeyDown={handleDivKeyDown}
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  fontFamily: 'JetBrains Mono, 阿里妈妈方圆体, monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  margin: 0,
                  padding: '8px',
                  whiteSpace: 'pre-wrap', // 改为pre-wrap，支持自动换行
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'transparent',
                  caretColor: '#7dd3fc',
                  zIndex: 2,
                  boxSizing: 'border-box',
                  cursor: 'text',
                  overflow: 'visible', // 保持visible
                  resize: 'none'
                }}
                spellCheck={false}
              />
            </div>
          ) : (
            <div key="display" className="text-node-content" style={{ width: 'auto', boxSizing: 'border-box' }}>
              {text ? (
                <pre 
                  className="syntax-highlighted-code"
                  dangerouslySetInnerHTML={{
                    __html: generateHighlightedCode(text)
                  }}
                  style={{
                    fontFamily: 'JetBrains Mono, 阿里妈妈方圆体, monospace',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    margin: 0,
                    padding: 0,
                    whiteSpace: 'pre-wrap', // 改为pre-wrap，支持自动换行
                    overflow: 'visible' // 保持visible
                  }}
                />
              ) : (
                <pre style={{ 
                  color: 'rgba(125, 225, 234, 0.4)',
                  fontFamily: 'JetBrains Mono, 阿里妈妈方圆体, monospace',
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
        <div className={`text-node-errors-section ${animatingOut.errors ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
          {/* 错误卡片 - 按行号排序 */}
          {errors.sort((a, b) => (a.line || 0) - (b.line || 0)).map((error, index) => (
            <div key={index} className={`${animatingOut.errors ? 'animate-fade-out-left' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
              {renderErrorCard(error, index)}
            </div>
          ))}
          
          {/* 警告卡片 - 按行号排序 */}
          {warnings.sort((a, b) => (a.line || 0) - (b.line || 0)).map((warning, index) => (
            <div key={index + errors.length} className={`${animatingOut.errors ? 'animate-fade-out-left' : ''}`} style={{ animationDelay: `${(index + errors.length) * 0.1}s` }}>
              {renderWarningCard(warning, index)}
            </div>
          ))}
        </div>
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
              {control.type === 'switch' && renderToggleControl(control)}
              {control.type === 'slider' && renderSliderControl(control)}
              {control.type === 'input' && renderTextControl(control)}
            </div>
          ))}
        </div>
      )}

      {/* 日志区域 - 在输入区域下面，输出区域上面 */}
      {!isCollapsed && (!hiddenSections.logs || animatingOut.logs) && consoleLogs.length > 0 && (
        <div className={`text-node-section text-node-logs-section ${animatingOut.logs ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
          <div className="section-label">Logs</div>
          <div className="log-container">
            {consoleLogs.map((log, index) => (
              <div key={index} className={`log-entry ${animatingOut.logs ? 'animate-fade-out-left' : 'animate-fade-in-left'}`} style={{ animationDelay: `${index * 0.05}s` }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 输出区域 - 只在有输出时显示且未隐藏 */}
      {!isCollapsed && (!hiddenSections.outputs || animatingOut.outputs) && Object.keys(outputs).length > 0 && (
        <div className={`text-node-section text-node-outputs-section ${animatingOut.outputs ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
          <div className="section-label">Outputs</div>
          {Object.keys(outputs).map((output, index) => (
            <div key={index} className={`${animatingOut.outputs ? 'animate-fade-out-right' : 'animate-fade-in-right'}`} style={{ animationDelay: `${index * 0.1}s` }}>
              {renderOutput(output, index)}
            </div>
          ))}
        </div>
      )}

      {/* 连接句柄 - 禁用拖动，只允许点击连接 */}
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