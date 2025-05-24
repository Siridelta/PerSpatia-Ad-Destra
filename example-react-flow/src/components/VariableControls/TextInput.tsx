import React, { useState, useRef, useCallback, useEffect } from 'react';
import { VariableInfo } from '../TextNode';

interface TextInputProps {
  variable: VariableInfo;
  onChange: (value: string) => void;
}

const TextInput: React.FC<TextInputProps> = ({ variable, onChange }) => {
  const { name, value } = variable;
  const [localValue, setLocalValue] = useState(value || '');
  const commitTimer = useRef<number | null>(null);

  const commitValueChange = useCallback((newValue: string) => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
    }
    
    commitTimer.current = setTimeout(() => {
      onChange(newValue);
      commitTimer.current = null;
    }, 500);
  }, [onChange]);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  useEffect(() => {
    return () => {
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    setLocalValue(newValue);
    
    commitValueChange(newValue);
  };

  const handleBlur = () => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    onChange(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
      onChange(localValue);
    }
  };

  const handleRightClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    setLocalValue('');
    
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    onChange('');
  };

  return (
    <div className="variable-control variable-text">
      <div className="variable-label">
        <span className="variable-name">{name}:</span>
      </div>
      <div className="text-input-container">
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onContextMenu={handleRightClick}
          className="text-input"
          placeholder="输入文本..."
          title="右键清空"
        />
      </div>
    </div>
  );
};

export default TextInput; 