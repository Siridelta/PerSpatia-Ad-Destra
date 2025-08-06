import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';

export interface CodeEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onExitEdit: () => void;
  className?: string;
  style?: React.CSSProperties;
}

// 代码编辑器组件 - 使用 Monaco 风格的输入机制
export const CodeEditor: React.FC<CodeEditorProps> = ({
  initialText,
  onTextChange,
  onExitEdit,
  className = '',
  style = {}
}) => {
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
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    
    // 使用更简单的方法计算光标位置
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const lineNumber = lines.length - 1;
    
    // 估算字符宽度和行高
    const charWidth = 8.4; // 字符宽度（估算）
    const lineHeight = 21; // 行高
    
    // 计算光标位置
    const x = currentLine.length * charWidth + 8; // 8px 是 padding
    const y = lineNumber * lineHeight + 8; // 8px 是 padding
    
    // 更新 textarea 位置
    textarea.style.left = `${x}px`;
    textarea.style.top = `${y}px`;
    
    setCursorPosition({ x, y });
  }, [text]);

  // 自动调整编辑器高度以适应内容
  const adjustSize = useCallback(() => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const container = editor.parentElement;
    
    if (!container) return;
    
    // 重置高度以获取真实的scrollHeight
    editor.style.height = 'auto';
    
    // 计算所需高度（至少100px）
    const scrollHeight = Math.max(editor.scrollHeight, 100);
    const newHeight = `${scrollHeight}px`;
    
    console.log('adjustSize called:', { scrollHeight, newHeight, textLength: text.length });
    
    // 设置编辑器高度
    editor.style.height = newHeight;
    
    // 同时调整父容器（TextNode 的代码区域）的高度
    const codeSection = container.closest('.text-node-code-section') as HTMLElement;
    if (codeSection) {
      codeSection.style.height = newHeight;
      console.log('Updated code section height to:', newHeight);
    }
  }, [text]);

  // 监听容器尺寸变化
  useEffect(() => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const container = editor.parentElement;
    
    if (!container) return;
    
    // 使用 ResizeObserver 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      // 当容器尺寸变化时，重新调整高度
      setTimeout(() => {
        adjustSize();
      }, 0);
    });
    
    // 监听父容器（TextNode 的代码区域）的尺寸变化
    const codeSection = container.closest('.text-node-code-section') as HTMLElement;
    if (codeSection) {
      resizeObserver.observe(codeSection);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [adjustSize]);

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

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 处理 Shift+Enter 退出编辑
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      exitEditMode();
    }
    
    // 处理 Escape 退出编辑
    if (e.key === 'Escape') {
      e.preventDefault();
      exitEditMode();
    }
  }, []);

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
    
    // 计算点击位置对应的字符位置
    const lines = text.split('\n');
    const lineHeight = 21; // 行高
    const charWidth = 8.4; // 字符宽度（估算）
    
    // 计算行号
    const lineNumber = Math.floor(clickY / lineHeight);
    const actualLineNumber = Math.max(0, Math.min(lineNumber, lines.length - 1));
    
    // 计算列号
    const currentLine = lines[actualLineNumber] || '';
    const columnNumber = Math.floor(clickX / charWidth);
    const actualColumnNumber = Math.max(0, Math.min(columnNumber, currentLine.length));
    
    // 计算字符位置
    let charPosition = 0;
    for (let i = 0; i < actualLineNumber; i++) {
      charPosition += lines[i].length + 1; // +1 for newline
    }
    charPosition += actualColumnNumber;
    
    // 设置光标位置
    const textarea = textareaRef.current;
    textarea.focus();
    textarea.setSelectionRange(charPosition, charPosition);
    
    // 更新光标位置
    setTimeout(() => {
      updateCursorPosition();
    }, 0);
  }, [isEditing, text, updateCursorPosition]);

  // 进入编辑模式
  const enterEditMode = useCallback(() => {
    setIsEditing(true);
  }, []);

  // 退出编辑模式
  const exitEditMode = useCallback(() => {
    setIsEditing(false);
    onExitEdit();
  }, [onExitEdit]);

  // 处理失焦事件
  const handleBlur = useCallback(() => {
    // 延迟退出编辑模式，避免点击事件冲突
    setTimeout(() => {
      if (isEditing) {
        exitEditMode();
      }
    }, 100);
  }, [isEditing, exitEditMode]);

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
        // 暂时不使用点击位置，直接移到末尾
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

  // 初始化时调整尺寸
  useEffect(() => {
    if (editorRef.current) {
      setTimeout(() => {
        adjustSize();
      }, 0);
    }
  }, [adjustSize]);

  return (
    <div 
      className={`code-editor ${className}`}
      style={{ position: 'relative', ...style }}
    >
      {/* 语法高亮显示层 */}
      <div
        ref={editorRef}
        onDoubleClick={handleDoubleClick}
        onClick={handleDisplayClick}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
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
          pointerEvents: 'auto',
          userSelect: 'none'
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
    </div>
  );
};

export default CodeEditor; 