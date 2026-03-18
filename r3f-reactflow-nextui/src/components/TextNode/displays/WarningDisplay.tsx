import React from 'react';

export interface WarningInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface WarningDisplayProps {
  warnings: WarningInfo[];
  isAnimatingOut?: boolean;
}

const WarningDisplay: React.FC<WarningDisplayProps> = ({ warnings, isAnimatingOut = false }) => {
  if (warnings.length === 0) return null;

  const renderWarningCard = (warning: WarningInfo, index: number) => {
    return (
      <div key={index} className={`warning-card animate-fade-in-up ${isAnimatingOut ? 'animate-fade-out-left' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
        <div className="warning-header">
          <span className="warning-label">Warning</span>
          {warning.line && (
            <span className="warning-location">行 {warning.line}{warning.column ? `:${warning.column}` : ''}</span>
          )}
        </div>
        <div className="warning-message">{warning.message}</div>
        {warning.stack && (
          <div className="warning-stack">
            <details>
              <summary>栈追踪</summary>
              <pre>{warning.stack}</pre>
            </details>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`text-node-warnings-section ${isAnimatingOut ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
      {warnings.sort((a, b) => (a.line || 0) - (b.line || 0)).map((warning, index) => 
        renderWarningCard(warning, index)
      )}
    </div>
  );
};

export default WarningDisplay; 