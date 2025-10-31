/// <reference types="desmos" />

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useCanvasUIData } from '@/hooks/useCanvasUIData';

import './styles.css';
import { DesmosPreviewNodeType } from '@/types/canvas';

// ============================================================================
// 类型定义
// ============================================================================

export interface DesmosPreviewNodeData extends Record<string, unknown> {
  sourceNodeId: string;
  sourceOutputName: string;
  desmosState?: Desmos.GraphState;
}

// ============================================================================
// Desmos 脚本加载工具
// ============================================================================

const DESMOS_SCRIPT_URL = 'https://www.desmos.com/api/v1.10/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';

let desmosLoader: Promise<void> | null = null;

const ensureDesmosLoaded = (): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.Desmos) {
    return Promise.resolve();
  }

  if (desmosLoader) {
    return desmosLoader;
  }

  desmosLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-desmos-script="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Desmos 脚本加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = DESMOS_SCRIPT_URL;
    script.async = true;
    script.dataset.desmosScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Desmos 脚本加载失败'));
    document.head.appendChild(script);
  });

  return desmosLoader;
};

// ============================================================================
// 主组件实现
// ============================================================================

const DesmosPreviewNode: React.FC<NodeProps<DesmosPreviewNodeType>> = ({ id, data, selected }) => {
  const [isReady, setIsReady] = useState<boolean>(typeof window !== 'undefined' && !!window.Desmos);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const calculatorRef = useRef<Desmos.Calculator | null>(null);
  const lastSyncedState = useRef<string>('');

  const { updateNode } = useCanvasUIData();

  const sourceLabel = useMemo(() => {
    const nodeId = data?.sourceNodeId || '未知节点';
    const outputName = data?.sourceOutputName || '未知输出';
    return `${nodeId} · ${outputName}`;
  }, [data?.sourceNodeId, data?.sourceOutputName]);

  // 监听 Desmos 脚本加载并初始化计算器
  useEffect(() => {
    let isCancelled = false;

    ensureDesmosLoaded()
      .then(() => {
        if (isCancelled) return;
        setIsReady(true);

        if (!containerRef.current || calculatorRef.current || !window.Desmos) return;

        const calculator = window.Desmos.GraphingCalculator(containerRef.current, {
          expressions: false,
          settingsMenu: false,
          zoomButtons: true,
          keypad: false,
        });

        calculatorRef.current = calculator;

        if (data?.desmosState) {
          try {
            calculator.setState(data.desmosState);
            lastSyncedState.current = JSON.stringify(data.desmosState);
          } catch (error) {
            console.error('初始化 Desmos 状态失败:', error);
          }
        }
      })
      .catch((error) => {
        if (isCancelled) return;
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isCancelled = true;
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
  }, [data?.desmosState]);

  // 当父节点传来新的状态时，刷新 Desmos 视图
  useEffect(() => {
    if (!isReady || !calculatorRef.current) return;

    const calculator = calculatorRef.current;
    const state = data?.desmosState ?? {};
    const serialized = JSON.stringify(state);

    if (serialized === lastSyncedState.current) {
      return;
    }

    try {
      calculator.setState(state);
      lastSyncedState.current = serialized;
    } catch (error) {
      console.error('Desmos 状态同步失败:', error);
    }
  }, [data?.desmosState, isReady]);

  // 当用户在预览节点内操作 Desmos 时，将最新状态写回节点数据，确保持久化
  useEffect(() => {
    if (!calculatorRef.current) return;

    const calculator = calculatorRef.current;

    const handleChange = () => {
      try {
        const nextState = calculator.getState();
        const serialized = JSON.stringify(nextState);
        if (serialized === lastSyncedState.current) {
          return;
        }
        lastSyncedState.current = serialized;
        updateNode(id, {
          data: {
            ...data,
            desmosState: nextState,
          },
        });
      } catch (error) {
        console.error('读取 Desmos 状态失败:', error);
      }
    };

    calculator.observeEvent('change', handleChange);

    return () => {
        calculator?.unobserveEvent('change');
    };
  }, [data, id, updateNode]);

  return (
    <div className={`desmos-preview-node${selected ? ' selected' : ''}`}>
      <Handle id="input" type="target" position={Position.Left} className="desmos-preview-handle" />

      <div className="desmos-preview-header">
        <span className="desmos-preview-title">Desmos 预览</span>
        <span className="desmos-preview-source">{sourceLabel}</span>
      </div>

      <div className="desmos-preview-body">
        {errorMessage ? (
          <div className="desmos-preview-error">{errorMessage}</div>
        ) : (
          <>
            {!isReady && (
              <div className="desmos-preview-placeholder">正在加载 Desmos...</div>
            )}
            <div
              ref={containerRef}
              className={`desmos-preview-canvas${isReady ? '' : ' hidden'}`}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DesmosPreviewNode;

