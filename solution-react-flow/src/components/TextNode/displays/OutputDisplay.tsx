import React from 'react';

export interface OutputDisplayProps {
  outputs: Record<string, any>;
  isAnimatingOut?: boolean;
}

const OutputDisplay: React.FC<OutputDisplayProps> = ({ outputs, isAnimatingOut = false }) => {
  if (Object.keys(outputs).length === 0) return null;

  const renderOutput = (outputName: string, index: number) => {
    const value = outputs[outputName];
    const valueStr = String(value);
    const type = typeof value;
    
    return (
      <div key={index} className={`output-variable ${isAnimatingOut ? 'animate-fade-out-right' : 'animate-fade-in-right'}`} style={{ animationDelay: `${index * 0.1}s` }}>
          <span className="output-variable-name">{outputName}</span>
          <span className="output-variable-type">:{type}</span>
          <span className="output-variable-value">{valueStr}</span>
      </div>
    );
  };

  return (
    <div className={`text-node-section text-node-outputs-section ${isAnimatingOut ? 'animate-fade-out-down' : 'animate-fade-in-up'}`}>
      <div className="section-label">Outputs</div>
      {Object.keys(outputs).map((output, index) => 
        renderOutput(output, index)
      )}
    </div>
  );
};

export default OutputDisplay; 