import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type { CodeEditorComponent } from '../types';

const sanitizeInput = (value: string) => value.replace(/\u00A0/g, ' ');

const useSelectionPreserver = (elementRef: React.RefObject<HTMLDivElement>) => {
  const selectionRangeRef = useRef<Range | null>(null);

  const saveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (elementRef.current && elementRef.current.contains(range.startContainer)) {
      selectionRangeRef.current = range.cloneRange();
    }
  }, [elementRef]);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !selectionRangeRef.current) return;

    selection.removeAllRanges();
    selection.addRange(selectionRangeRef.current);
  }, []);

  return useMemo(() => ({ saveSelection, restoreSelection }), [saveSelection, restoreSelection]);
};

export const ContentEditableCodeEditor: CodeEditorComponent = ({
  initialText,
  onTextChange,
  onExitEdit,
  className = '',
  style = {}
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(initialText);
  const [isComposing, setIsComposing] = useState(false);

  const { saveSelection, restoreSelection } = useSelectionPreserver(editorRef as React.RefObject<HTMLDivElement>);

  // 同步外部初始值
  useEffect(() => {
    if (isComposing) return;
    if (text === initialText) return;
    setText(initialText);
  }, [initialText, isComposing, text]);

  // 同步 DOM 内容
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const domText = sanitizeInput(editor.innerText);
    if (domText === text) return;

    saveSelection();
    editor.innerText = text;
    restoreSelection();
  }, [text, saveSelection, restoreSelection]);

  const emitChange = useCallback(
    (nextText: string) => {
      const sanitized = sanitizeInput(nextText);
      setText(sanitized);
      onTextChange(sanitized);
    },
    [onTextChange]
  );

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    emitChange(editorRef.current.innerText);
  }, [emitChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && event.shiftKey)) {
        event.preventDefault();
        onExitEdit();
        editorRef.current?.blur();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        document.execCommand('insertText', false, '  ');
        handleInput();
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        document.execCommand('insertText', false, '\n');
        handleInput();
      }
    },
    [handleInput, onExitEdit]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, pasted);
      handleInput();
    },
    [handleInput]
  );

  const handleFocus = useCallback(() => {
    saveSelection();
  }, [saveSelection]);

  const handleBlur = useCallback(() => {
    saveSelection();
    onExitEdit();
  }, [onExitEdit, saveSelection]);

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
    handleInput();
  }, [handleInput]);

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      className={`code-editor-contenteditable ${className}`}
      style={{
        padding: '10px',
        fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
        fontSize: '14px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        outline: 'none',
        // border: '1px solid rgba(125, 211, 252, 0.35)',
        // borderRadius: '6px',
        // background: 'rgba(12, 74, 110, 0.06)',
        minHeight: '100px',
        boxSizing: 'border-box',
        ...style
      }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      data-gramm={false}
      data-enable-grammarly={false}
    />
  );
};

export default ContentEditableCodeEditor;

