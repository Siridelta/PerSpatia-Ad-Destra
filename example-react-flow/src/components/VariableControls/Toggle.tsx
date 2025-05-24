import React from 'react';
import { VariableInfo } from '../TextNode';

interface ToggleProps {
  variable: VariableInfo;
  onChange: (value: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ variable, onChange }) => {
  const { name, value } = variable;

  const handleToggle = () => {
    onChange(!value);
  };

  return (
    <div className="variable-control variable-toggle">
      <div className="variable-label">
        <span className="variable-name">{name}:</span>
      </div>
      <div className="toggle-container" onClick={handleToggle}>
        <div className={`toggle-switch ${value ? 'active' : ''}`}>
          <div className="toggle-knob" />
        </div>
        <span className="toggle-text">
          {value ? 'true' : 'false'}
        </span>
      </div>
    </div>
  );
};

export default Toggle; 