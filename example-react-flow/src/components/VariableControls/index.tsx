import React, { useState } from 'react';
import { VariableInfo } from '../TextNode';
import Slider from './Slider';
import TextInput from './TextInput';
import Toggle from './Toggle';
import './styles.css';

interface VariableControlsProps {
  variables: VariableInfo[];
  onVariableChange: (name: string, value: any) => void;
  onVariableConstraintsChange?: (name: string, constraints: { min: number; max: number; step: number }) => void;
  className?: string;
}

const VariableControls: React.FC<VariableControlsProps> = ({ 
  variables, 
  onVariableChange, 
  onVariableConstraintsChange,
  className = '' 
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (!variables || variables.length === 0) {
    return null;
  }

  const handleConstraintsChange = (variableName: string, constraints: { min: number; max: number; step: number }) => {
    if (onVariableConstraintsChange) {
      onVariableConstraintsChange(variableName, constraints);
    }
  };

  const renderControl = (variable: VariableInfo) => {
    const handleChange = (value: any) => {
      onVariableChange(variable.name, value);
    };

    switch (variable.type) {
      case 'range':
      case 'number':
        return (
          <Slider 
            key={variable.name}
            variable={variable} 
            onChange={handleChange}
            onConstraintsChange={(constraints) => handleConstraintsChange(variable.name, constraints)}
          />
        );
      
      case 'string':
        return (
          <TextInput 
            key={variable.name}
            variable={variable} 
            onChange={handleChange} 
          />
        );
      
      case 'boolean':
        return (
          <Toggle 
            key={variable.name}
            variable={variable} 
            onChange={handleChange} 
          />
        );
      
      default:
        // 未知类型默认为数字滑动条
        return (
          <Slider 
            key={variable.name}
            variable={{
              ...variable,
              type: 'range',
              constraints: {
                min: 0,
                max: 100,
                step: 1,
              }
            }} 
            onChange={handleChange}
            onConstraintsChange={(constraints) => handleConstraintsChange(variable.name, constraints)}
          />
        );
    }
  };

  return (
    <div className={`variable-controls control-font ${className}`}>
      {/* 可点击的分割线 */}
      <div 
        className="variable-controls-divider" 
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? '展开控件' : '折叠控件'}
      />
      
      <div className={`variable-controls-content ${collapsed ? 'collapsed' : ''}`}>
        {variables.map(renderControl)}
      </div>
    </div>
  );
};

export default VariableControls; 