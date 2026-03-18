import { useEffect, useRef, useCallback } from 'react';
import { SyntaxHighlighter } from '@/services/syntaxHighlighter';

/**
 * 语法高亮 Hook
 * 提供简单易用的语法高亮功能
 */
export const useSyntaxHighlight = (initialCode: string = '') => {
  const textElementRef = useRef<HTMLDivElement>(null);
  const highlightElementRef = useRef<HTMLDivElement>(null);
  const highlighterRef = useRef<SyntaxHighlighter | null>(null);
  const isInitializedRef = useRef(false);

  // 初始化语法高亮器
  useEffect(() => {
    if (
      textElementRef.current && 
      highlightElementRef.current && 
      !isInitializedRef.current
    ) {
      highlighterRef.current = new SyntaxHighlighter();
      highlighterRef.current.initialize(
        textElementRef.current,
        highlightElementRef.current
      );
      
      // 设置初始代码
      if (initialCode) {
        highlighterRef.current.setCode(initialCode);
      }
      
      isInitializedRef.current = true;
    }

    // 清理函数
    return () => {
      if (highlighterRef.current && isInitializedRef.current) {
        highlighterRef.current.destroy();
        highlighterRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [initialCode]);

  // 获取当前代码
  const getCode = useCallback((): string => {
    return highlighterRef.current?.getCode() || '';
  }, []);

  // 设置代码
  const setCode = useCallback((code: string) => {
    if (highlighterRef.current) {
      highlighterRef.current.setCode(code);
    }
  }, []);

  // 强制更新高亮
  const updateHighlight = useCallback(() => {
    if (highlighterRef.current) {
      // 通过私有方法访问（仅用于强制更新）
      (highlighterRef.current as any).updateHighlight?.();
    }
  }, []);

  return {
    textElementRef,
    highlightElementRef,
    getCode,
    setCode,
    updateHighlight,
    isInitialized: isInitializedRef.current,
  };
}; 