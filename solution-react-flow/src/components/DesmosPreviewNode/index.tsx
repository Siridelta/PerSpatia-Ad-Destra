/// <reference types="desmos" />

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useNodeEval } from '@/contexts/CanvasEvalContext';

import './styles.css';
import { FlowDesmosPreviewNode, DesmosPreviewEdge } from '@/types/canvas';
import { useCanvasUIDataApi } from '@/contexts/CanvasUIDataContext';

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

const DesmosPreviewNode: React.FC<NodeProps<FlowDesmosPreviewNode>> = ({ id, selected }) => {
  const [isReady, setIsReady] = useState<boolean>(typeof window !== 'undefined' && !!window.Desmos);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const calculatorRef = useRef<Desmos.Calculator | null>(null);
  const lastSyncedState = useRef<string>('');

  const { useUIData } = useCanvasUIDataApi();
  const previewEdge = useUIData((ui) =>
    ui.edges.find((edge) => edge.type === 'desmosPreviewEdge' && edge.target === id) as DesmosPreviewEdge | undefined,
  );
  const sourceNode = useUIData((ui) => {
    if (!previewEdge) return undefined;
    const candidate = ui.nodes.find((node) => node.id === previewEdge.source);
    if (candidate?.type === 'textNode') {
      return candidate;
    }
    return undefined;
  });

  const sourceLabel = useMemo(() => {
    const nodeName = sourceNode?.data.nodeName?.trim();
    const nodeDisplay = nodeName || sourceNode?.id || '未知节点';
    const outputName = previewEdge?.data?.sourceOutputName || '未知输出';
    return `${nodeDisplay} · ${outputName}`;
  }, [previewEdge?.data?.sourceOutputName, sourceNode?.data.nodeName, sourceNode?.id]);

  const nodeEval = useNodeEval(id);
  const desmosState = nodeEval?.outputs?.desmosState as Desmos.GraphState | undefined;

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
        lastSyncedState.current = '';
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
  }, []);

  // 当父节点传来新的状态时，刷新 Desmos 视图
  useEffect(() => {
    if (!isReady || !calculatorRef.current) return;

    const calculator = calculatorRef.current;
    const serialized = desmosState ? JSON.stringify(desmosState) : '';

    if (serialized === lastSyncedState.current) {
      return;
    }

    try {
      if (desmosState) {
        calculator.setState(desmosState);
      } else if (typeof (calculator as any).setBlank === 'function') {
        (calculator as any).setBlank();
      } else {
        calculator.setState({ expressions: { list: [] } } as Desmos.GraphState);
      }
      lastSyncedState.current = serialized;
    } catch (error) {
      console.error('Desmos 状态同步失败:', error);
    }
  }, [desmosState, isReady]);

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

