import React from 'react';

export interface ErrorInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface ErrorDisplayProps {
  errors: ErrorInfo[];
  isAnimatingOut?: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ errors, isAnimatingOut = false }) => {
  if (errors.length === 0) return null;

  const renderErrorCard = (error: ErrorInfo, index: number) => {
    return (
      <div key={index} className={`error-card animate-fade-in-up ${isAnimatingOut ? 'animate-fade-out-left' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
        <div className="error-header">
          <span className="error-label">Error</span>
          {error.line && (
            <span className="error-location">行 {error.line}{error.column ? `:${error.column}` : ''}</span>
          )}
        </div>
        <div className="error-message">{error.message}</div>
        {error.stack && (
          <div className="error-stack">
            <details>
              <summary>栈追踪</summary>
              <pre>{error.stack}</pre>
            </details>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`text-node-errors-section ${isAnimatingOut ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
      {errors.sort((a, b) => (a.line || 0) - (b.line || 0)).map((error, index) => 
        renderErrorCard(error, index)
      )}
    </div>
  );
};

export default ErrorDisplay; 