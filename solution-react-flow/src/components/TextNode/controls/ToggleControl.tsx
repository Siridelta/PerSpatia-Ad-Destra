import React from 'react';

export interface ToggleControlProps {
  control: {
    name: string;
    defaultValue?: boolean;
  };
  value: boolean;
  onChange: (name: string, value: boolean) => void;
}

const ToggleControl: React.FC<ToggleControlProps> = ({ control, value, onChange }) => {
  // 处理开关点击
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(control.name, !value);
  };

  return (
    <div className="toggle-container nodrag">
      <div 
        className={`toggle-switch ${value ? 'active' : ''}`}
        onClick={handleToggleClick}
      >
        <div className="toggle-knob"></div>
      </div>
      <span 
        className="toggle-text" 
        style={{ color: value ? '#28d900' : '#d90000' }}
      >
        {value ? 'true' : 'false'}
      </span>
    </div>
  );
};

export default ToggleControl; 