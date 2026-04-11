import { useKeyPress } from '@xyflow/react';
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

  const isCtrlPressed = useKeyPress('Control');

  return (
    <div className="toggle-container">
      <span
        className={`toggle-text ${value ? 'toggle-text-true' : 'toggle-text-false'}`}
      >
        {value ? 'true' : 'false'}
      </span>
      <div
        className={`toggle-switch ${isCtrlPressed ? 'drag' : 'nodrag'} ${value ? 'active' : ''}`}
        onClick={handleToggleClick}
      >
        <div className="toggle-knob"></div>
      </div>
    </div>
  );
};

export default ToggleControl; 