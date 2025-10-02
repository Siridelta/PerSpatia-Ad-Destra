import React, { useEffect, useRef } from 'react';

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

  // 同步镜像层内容
  useEffect(() => {
    if (!mirrorRef.current) return;
    mirrorRef.current.textContent = initialText;
  }, [initialText]);

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
      mirrorRef.current.textContent = value;
    }
    onTextChange(value);
  };

  return (
    <div className={`code-editor-dual ${className}`} style={{ position: 'relative', ...style }}>
      <pre
        ref={mirrorRef}
        className="code-editor-dual__mirror"
        aria-hidden
        style={{
          margin: 0,
          padding: '8px',
          fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
          fontSize: '14px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          border: '1px solid rgba(125, 211, 252, 0.35)',
          borderRadius: '6px',
          background: 'rgba(12, 74, 110, 0.06)'
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
          padding: '8px',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          border: 'none',
          background: 'transparent',
          boxSizing: 'border-box',
          resize: 'none',
          color: 'inherit'
        }}
      />
    </div>
  );
};

export default DualLayerCodeEditor;

