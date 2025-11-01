import React, { useMemo } from 'react';
import { useCanvasUIData } from '@/hooks/useCanvasUIData';

interface ExportableOutputInfo {
  name: string;
  value: unknown;
  isExportable: boolean;
  // reason?: string;
}

export interface OutputDisplayProps {
  outputs: Record<string, unknown>;
  isAnimatingOut?: boolean;
  nodeId: string;
}

const OutputDisplay: React.FC<OutputDisplayProps> = ({ outputs, isAnimatingOut = false, nodeId }) => {

  const { createDesmosPreviewNode, updateDesmosPreviewState, useUIData } = useCanvasUIData();
  const desmosPreviewLinks = useUIData((data) => data.desmosPreviewLinks);

  const exportableOutputs = useMemo<ExportableOutputInfo[]>(() => {
    return Object.entries(outputs).map(([name, value]) => {
      const isObject = value !== null && typeof value === 'object';
      const isArrayOfObjects = Array.isArray(value) && value.length > 0 && value.every((item) => item && typeof item === 'object');

      return {
        name,
        value,
        isExportable: isObject || isArrayOfObjects,
        // reason: isObject || isArrayOfObjects ? undefined : '仅支持对象格式输出',
      };
    });
  }, [outputs]);

  const handleExport = (info: ExportableOutputInfo) => {
    if (!info.isExportable) return;

    const resolvedSourceNodeId = (info.value as { _sourceNodeId?: string })?._sourceNodeId ?? nodeId;

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
    return (
      <button
        className="output-export-button"
        type="button"
        onClick={() => handleExport(info)}
        title={'导出 Desmos 预览'}
        aria-label={`导出 ${info.name} 的 Desmos 预览`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.33398 6.66699C9.70175 6.66743 9.99991 6.96516 10 7.33301C10 7.70093 9.7018 7.99858 9.33398 7.99902V8.00098H8.00098V16.001H16.001V15.0088C16.0009 15.0059 16 15.0029 16 15C16.0001 14.6319 16.2989 14.334 16.667 14.334C17.035 14.3342 17.3329 14.632 17.333 15L17.334 16.001C17.3335 16.7367 16.7367 17.3335 16.001 17.334H8.00098C7.26487 17.334 6.66646 16.737 6.66602 16.001V8.00098C6.66602 7.2646 7.2646 6.66602 8.00098 6.66602L9.33398 6.66699Z" fill="white" />
          <path d="M17 5.99902C17.3682 5.99902 17.667 6.2988 17.667 6.66699V12C17.6667 12.368 17.368 12.667 17 12.667C16.632 12.667 16.3333 12.368 16.333 12V8.35254L12.4863 12.4561C12.2346 12.7243 11.8125 12.7378 11.5439 12.4863C11.2756 12.2346 11.2622 11.8125 11.5137 11.5439L15.4609 7.33398H12C11.632 7.33398 11.3333 7.03496 11.333 6.66699C11.333 6.2988 11.6318 5.99902 12 5.99902H17Z" fill="white" />
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
        {info.isExportable && renderExportButton(info)}
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