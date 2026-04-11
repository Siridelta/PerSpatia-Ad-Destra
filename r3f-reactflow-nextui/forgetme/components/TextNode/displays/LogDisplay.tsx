import React from 'react';

export interface LogDisplayProps {
  logs: string[];
  isAnimatingOut?: boolean;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs, isAnimatingOut = false }) => {
  if (logs.length === 0) return null;

  return (
    <div className={`text-node-section text-node-logs-section ${isAnimatingOut ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
      <div className="section-label">Logs</div>
      <div className="log-container">
        {logs.map((log, index) => (
          <div key={index} className={`log-entry ${isAnimatingOut ? 'animate-fade-out-left' : 'animate-fade-in-left'}`} style={{ animationDelay: `${index * 0.05}s` }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogDisplay; 