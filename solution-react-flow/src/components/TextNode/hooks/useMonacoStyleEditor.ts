import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';

export interface UseMonacoStyleEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onExitEdit: () => void;
}

export interface UseMonacoStyleEditorReturn {
  // 状态
  isEditing: boolean;
  text: string;
  
  // 编辑器引用
  editorRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  
  // 事件处理
  handleInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleDisplayClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleBlur: () => void;
  
  // 编辑器控制
  enterEditMode: () => void;
  exitEditMode: () => void;
  
  // 语法高亮
  highlightedHtml: string;
  
  // 尺寸调整
  adjustSize: () => void;
  
  // 光标位置
  cursorPosition: { x: number; y: number };
}

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

export const useMonacoStyleEditor = ({ 
  initialText, 
  onTextChange, 
  onExitEdit 
}: UseMonacoStyleEditorProps): UseMonacoStyleEditorReturn => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 记录最近一次点击事件，用于进入编辑态时定位光标
  const lastPointerDown = useRef<{ x: number; y: number } | null>(null);
  
  // 记录用户是否正在输入，避免干扰光标位置
  const isUserInputting = useRef(false);
  
  // 记录编辑器是否已经初始化内容
  const editorInitialized = useRef(false);

  // 生成语法高亮的HTML
  const generateHighlightedCode = useCallback((code: string): string => {
    if (!code.trim()) return '';
    
    try {
      const highlighted = Prism.highlight(code, Prism.languages.javascript, 'javascript');
      return highlighted;
    } catch (error) {
      console.warn('语法高亮失败:', error);
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }, []);

  // 语法高亮HTML
  const highlightedHtml = useMemo(() => 
    generateHighlightedCode(text), [text, generateHighlightedCode]
  );

  // 计算光标位置并更新 textarea 位置
  const updateCursorPosition = useCallback(() => {
    if (!textareaRef.current || !editorRef.current) return;
    
    const textarea = textareaRef.current;
    const editor = editorRef.current;
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    
    // 创建临时元素来计算光标位置
    const tempElement = document.createElement('div');
    tempElement.style.fontFamily = 'JetBrains Mono, AlimamaFangYuanTi, monospace';
    tempElement.style.fontSize = '14px';
    tempElement.style.lineHeight = '1.5';
    tempElement.style.whiteSpace = 'pre-wrap';
    tempElement.style.position = 'absolute';
    tempElement.style.visibility = 'hidden';
    tempElement.style.padding = '8px';
    tempElement.style.top = '-9999px';
    tempElement.style.left = '-9999px';
    tempElement.textContent = textBeforeCursor;
    
    document.body.appendChild(tempElement);
    
    // 计算光标位置
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const lineNumber = lines.length - 1;
    
    // 计算当前行的宽度
    const currentLineElement = document.createElement('div');
    currentLineElement.style.fontFamily = 'JetBrains Mono, AlimamaFangYuanTi, monospace';
    currentLineElement.style.fontSize = '14px';
    currentLineElement.style.whiteSpace = 'pre';
    currentLineElement.textContent = currentLine;
    
    document.body.appendChild(currentLineElement);
    const lineWidth = currentLineElement.offsetWidth;
    document.body.removeChild(currentLineElement);
    
    // 计算光标位置
    const x = lineWidth + 8; // 8px 是 padding
    const y = lineNumber * 21 + 8; // 21px 是行高，8px 是 padding
    
    document.body.removeChild(tempElement);
    
    // 更新 textarea 位置
    textarea.style.left = `${x}px`;
    textarea.style.top = `${y}px`;
    
    setCursorPosition({ x, y });
  }, [text]);

  // 自动调整编辑器尺寸以适应内容
  const adjustSize = useCallback(() => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const container = editor.parentElement;
    const nodeContainer = container?.closest('.text-node') as HTMLElement;
    
    if (!container || !nodeContainer) return;
    
    // 重置高度以获取真实的scrollHeight
    editor.style.height = 'auto';
    container.style.height = 'auto';
    
    // 计算所需高度（至少100px）
    const scrollHeight = Math.max(editor.scrollHeight, 100);
    const newHeight = `${scrollHeight}px`;
    
    // 设置高度
    editor.style.height = newHeight;
    container.style.height = newHeight;
    
    // 计算内容所需的宽度
    const tempElement = document.createElement('pre');
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
    const minNodeWidth = Math.max(contentWidth + 60, 300);
    
    // 设置节点容器的宽度
    nodeContainer.style.width = `${minNodeWidth}px`;
  }, [text]);

  // 处理文本变化（textarea）
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    isUserInputting.current = true;
    const currentCode = e.currentTarget.value;
    setText(currentCode);
    onTextChange(currentCode);
    
    // 更新光标位置
    setTimeout(() => {
      updateCursorPosition();
    }, 0);
    
    // 自动调整编辑器高度
    setTimeout(() => {
      adjustSize();
    }, 0);
    
    // 短暂延迟后重置标志，避免其他操作被误认为用户输入
    setTimeout(() => {
      isUserInputting.current = false;
    }, 100);
  }, [onTextChange, updateCursorPosition, adjustSize]);

  // 退出编辑状态的复用逻辑
  const exitEditMode = useCallback(() => {
    // 从 textarea 元素获取最新代码
    const finalCode = textareaRef.current?.value || text;
    setText(finalCode);
    
    setIsEditing(false);
    isUserInputting.current = false;
    editorInitialized.current = false;
    
    onExitEdit();
  }, [text, onExitEdit]);

  // 处理编辑器失去焦点
  const handleBlur = useCallback(() => {
    // 延迟一点时间，避免点击其他元素时立即退出
    setTimeout(() => {
      if (isEditing) {
        exitEditMode();
      }
    }, 100);
  }, [isEditing, exitEditMode]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Esc
    if (e.key === 'Escape') {
      e.preventDefault();
      exitEditMode();
    } 
    // Shift + Enter
    else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      exitEditMode();
    }
  }, [exitEditMode]);

  // 处理双击事件
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

  // 处理显示层点击事件
  const handleDisplayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing || !textareaRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // 计算点击位置相对于文本的位置
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - 8; // 减去 padding
    const clickY = e.clientY - rect.top - 8;
    
    // 简单实现：将光标移到末尾
    // TODO: 实现更精确的光标定位
    const textarea = textareaRef.current;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    // 更新光标位置
    setTimeout(() => {
      updateCursorPosition();
    }, 0);
  }, [isEditing, updateCursorPosition]);

  // 进入编辑模式
  const enterEditMode = useCallback(() => {
    setIsEditing(true);
  }, []);

  // 自动聚焦到编辑器
  useEffect(() => {
    // 只有在刚进入编辑模式且用户没有正在输入时才重新定位光标
    if (isEditing && textareaRef.current && !isUserInputting.current) {
      const textareaElement = textareaRef.current;
      
      // 首先设置内容（只在编辑器刚初始化时或内容确实不匹配时）
      if (!editorInitialized.current || textareaElement.value !== text) {
        textareaElement.value = text;
        editorInitialized.current = true;
        
        // 调整编辑器高度
        setTimeout(() => {
          adjustSize();
        }, 0);
      }
      
      // 聚焦元素
      textareaElement.focus();
      
      // 如果有记录的点击位置，尝试定位光标
      if (lastPointerDown.current) {
        const { x, y } = lastPointerDown.current;
        
        setTimeout(() => {
          // 尝试根据点击位置设置光标
          const textarea = textareaRef.current;
          if (textarea) {
            // 简单实现：将光标移到末尾
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            updateCursorPosition();
          }
        }, 10);
        
        // 清除记录的位置
        lastPointerDown.current = null;
      } else {
        // 没有点击位置，将光标移到末尾（只在初次进入编辑模式时）
        setTimeout(() => {
          const textarea = textareaRef.current;
          if (textarea) {
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            updateCursorPosition();
          }
        }, 10);
      }
    }
  }, [isEditing, text, adjustSize, updateCursorPosition]);

  return {
    isEditing,
    text,
    editorRef,
    textareaRef,
    handleInput,
    handleKeyDown,
    handleDoubleClick,
    handleDisplayClick,
    handleBlur,
    enterEditMode,
    exitEditMode,
    highlightedHtml,
    adjustSize,
    cursorPosition,
  };
}; 