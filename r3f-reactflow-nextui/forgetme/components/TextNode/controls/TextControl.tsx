import { useKeyPress } from '@xyflow/react';
import React from 'react';

export interface TextControlProps {
  control: {
    name: string;
    defaultValue?: string;
  };
  value: string;
  onChange: (name: string, value: string) => void;
}

const TextControl: React.FC<TextControlProps> = ({ control, value, onChange }) => {
  // 处理文本框右键清空
  const handleTextRightClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(control.name, control.defaultValue || '');
  };

  // 处理文本框变化
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onChange(control.name, e.target.value);
  };

  const isCtrlPressed = useKeyPress('Control');

  return (
    <div className="text-input-container">
      <input
        type="text"
        value={value}
        onChange={handleTextChange}
        onContextMenu={handleTextRightClick}
        className={`text-input ${isCtrlPressed ? 'drag' : 'nodrag'}`}
        placeholder="输入文本..."
        title="右键清空"
      />
      {/* 使用一个div来模拟下划线 */}
      <div className="text-input-underline" />
    </div>
  );
};

export default TextControl; 