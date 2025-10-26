import React, { useMemo } from 'react';
import { useCanvasState } from '@/hooks/useCanvasState';

interface ExportableOutputInfo {
  name: string;
  value: any;
  isExportable: boolean;
  reason?: string;
}

export interface OutputDisplayProps {
  outputs: Record<string, any>;
  isAnimatingOut?: boolean;
  nodeId: string;
}

const OutputDisplay: React.FC<OutputDisplayProps> = ({ outputs, isAnimatingOut = false, nodeId }) => {
  if (Object.keys(outputs).length === 0) return null;

  const { createDesmosPreviewNode, updateDesmosPreviewState, desmosPreviewLinks } = useCanvasState();

  const exportableOutputs = useMemo<ExportableOutputInfo[]>(() => {
    return Object.entries(outputs).map(([name, value]) => {
      const isObject = value !== null && typeof value === 'object';
      const isArrayOfObjects = Array.isArray(value) && value.length > 0 && value.every((item) => item && typeof item === 'object');

      return {
        name,
        value,
        isExportable: isObject || isArrayOfObjects,
        reason: isObject || isArrayOfObjects ? undefined : '仅支持对象格式输出',
      };
    });
  }, [outputs]);

  const handleExport = (info: ExportableOutputInfo) => {
    if (!info.isExportable) return;

    const resolvedSourceNodeId = info.value?._sourceNodeId ?? nodeId;

    const existingLink = desmosPreviewLinks?.[resolvedSourceNodeId];
    if (existingLink) {
      updateDesmosPreviewState(resolvedSourceNodeId, info.value);
      return;
    }

    createDesmosPreviewNode({
      sourceNodeId: resolvedSourceNodeId,
      sourceOutputName: info.name,
      desmosState: info.value,
    });
  };

  const renderExportButton = (info: ExportableOutputInfo) => {
    const disabled = !info.isExportable;

    return (
      <button
        className="output-export-button"
        type="button"
        onClick={() => handleExport(info)}
        disabled={disabled}
        title={disabled && info.reason ? info.reason : '导出到 Desmos 预览'}
        aria-label={`导出 ${info.name} 到 Desmos 预览`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M5 19h4v2H5a2 2 0 0 1-2-2v-4h2v4zm11-16h-4V1h4a2 2 0 0 1 2 2v4h-2V3zm-9.95 2.05 2.828-2.828 1.414 1.414-2.829 2.828zM19 15h2v4a2 2 0 0 1-2 2h-4v-2h4zm-7-7 3 3-1.414 1.414L13 11.828V20h-2v-8.172l-1.586 1.586L8 11l3-3z"
          />
        </svg>
      </button>
    );
  };

  const renderOutput = (info: ExportableOutputInfo, index: number) => {
    const { name, value } = info;
    const valueStr = (() => {
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return '[object Object]';
        }
      }
      return String(value);
    })();

    const type = Array.isArray(value) ? 'array' : typeof value;

    return (
      <div
        key={name}
        className={`output-variable ${isAnimatingOut ? 'animate-fade-out-right' : 'animate-fade-in-right'}`}
        style={{ animationDelay: `${index * 0.1}s` }}
      >
        <span className="output-variable-name">{name}</span>
        <span className="output-variable-type">:{type}</span>
        <span className="output-variable-value">{valueStr}</span>
        {renderExportButton(info)}
      </div>
    );
  };

  return (
    <div className={`text-node-section text-node-outputs-section ${isAnimatingOut ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
      <div className="section-label">Outputs</div>
      {exportableOutputs.map(renderOutput)}
    </div>
  );
};

export default OutputDisplay; 