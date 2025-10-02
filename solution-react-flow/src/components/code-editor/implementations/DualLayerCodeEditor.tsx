import React, { useEffect, useRef, useCallback } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import { useKeyPress } from '@xyflow/react';

import type { CodeEditorComponent } from '../types';

/**
 * 早期的实现：显示层与 textarea 输入层相互叠加并同步
 * 由于该实现来自历史版本，目前功能仅做最小实现，以方便后续回溯。
 */
export const DualLayerCodeEditor: CodeEditorComponent = ({
  initialText,
  onTextChange,
  onExitEdit,
  className = '',
  style = {}
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLPreElement>(null);

  // 使用 Prism 生成语法高亮的 HTML 片段
  const highlightCode = useCallback((code: string): string => {
    // 约定：空字符串直接返回以避免不必要的 innerHTML 更新
    if (!code) return ' &nbsp;';

    try {
      return Prism.highlight(code, Prism.languages.javascript, 'javascript');
    } catch (error) {
      console.warn('DualLayerCodeEditor 语法高亮失败', error);
      // 回退到基础的 HTML 转义，避免破坏显示层
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }, []);

  // 同步镜像层内容
  useEffect(() => {
    if (!mirrorRef.current) return;
    mirrorRef.current.innerHTML = highlightCode(initialText);
  }, [initialText, highlightCode]);


  // ------------------
  // 按住 Shift 键，强制进入全部位可拖动状态
  // ------------------
  // 使用 React Flow 的内置按键监听 hook，避免手动注册全局事件
  const isShiftPressed = useKeyPress('Shift');

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && event.shiftKey)) {
      event.preventDefault();
      onExitEdit();
      textareaRef.current?.blur();
    }
  };

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    const value = event.currentTarget.value;
    if (mirrorRef.current) {
      mirrorRef.current.innerHTML = highlightCode(value);
    }
    onTextChange(value);
  };

  return (
    <div
      className={`code-editor-dual ${className}`}
      style={{ position: 'relative', ...style }}
    >
      <pre
        ref={mirrorRef}
        className="code-editor-dual__mirror"
        aria-hidden
        style={{
          margin: 0,
          padding: '10px',
          fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
          fontSize: '14px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          border: 'none',
          background: 'rgba(12, 74, 110, 0.06)',
          color: 'rgba(255, 255, 255, 0.8)',
        }}
      />
      <textarea
        ref={textareaRef}
        defaultValue={initialText}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={onExitEdit}
        spellCheck={false}
        style={{
          position: 'absolute',
          inset: 0,
          padding: '10px',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          border: 'none',
          background: 'transparent',
          boxSizing: 'border-box',
          resize: 'none',
          color: 'transparent',
          caretColor: 'white',
        }}
        className="focus:outline-none"
      />
    </div>
  );
};

export default DualLayerCodeEditor;

