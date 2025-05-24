import React, { useState, useRef, useCallback } from 'react';
import { VariableInfo } from '../TextNode';

interface SliderProps {
  variable: VariableInfo;
  onChange: (value: number) => void;
  onConstraintsChange?: (constraints: { min: number; max: number; step: number }) => void;
}

const Slider: React.FC<SliderProps> = ({ variable, onChange, onConstraintsChange }) => {
  const { name, value, constraints } = variable;
  const min = constraints?.min ?? 0;
  const max = constraints?.max ?? 100;
  const step = constraints?.step ?? 1;
  
  const [isEditingParams, setIsEditingParams] = useState(false);
  const [localConstraints, setLocalConstraints] = useState({ min, max, step });
  const [localValue, setLocalValue] = useState(value); // 添加本地值状态
  const isDragging = useRef(false);
  const commitTimer = useRef<number | null>(null); // 添加定时器引用

  // 延迟提交值变化的函数
  const commitValueChange = useCallback((newValue: number) => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
    }
    
    commitTimer.current = setTimeout(() => {
      onChange(newValue);
      commitTimer.current = null;
    }, 300); // 300ms延迟
  }, [onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = parseFloat(e.target.value);
    
    // 确保值在范围内
    newValue = Math.max(min, Math.min(max, newValue));
    
    // 简化精度修复：直接检测接近最大值的情况
    const threshold = step * 0.1; // 使用更小的阈值
    if (newValue >= max - threshold) {
      newValue = max;
    } else {
      // 标准步长计算
      const steps = Math.round((newValue - min) / step);
      newValue = min + steps * step;
      
      // 确保精度
      if (step < 1) {
        const decimals = step.toString().split('.')[1]?.length || 0;
        newValue = parseFloat(newValue.toFixed(decimals));
      } else {
        newValue = Math.round(newValue);
      }
      
      // 再次检查是否超过最大值
      if (newValue > max) {
        newValue = max;
      }
    }
    
    // 立即更新本地值（UI响应）
    setLocalValue(newValue);
    
    // 延迟提交到父组件（避免频繁执行）
    commitValueChange(newValue);
  };

  // 鼠标按下时开始拖动
  const handleSliderMouseDown = (_e: React.MouseEvent) => {
    isDragging.current = true;
    // 清除可能存在的定时器
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  };

  // 鼠标松开时结束拖动
  const handleSliderMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      // 立即提交当前值，不延迟
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
      onChange(localValue);
    }
  }, [localValue, onChange]);

  // 添加全局鼠标事件监听
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging.current) {
        handleSliderMouseUp();
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      // 清理定时器
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
      }
    };
  }, [handleSliderMouseUp]);

  // 当外部value变化时，同步localValue
  React.useEffect(() => {
    // 只有在不在拖动状态且没有待提交的更改时才同步外部值
    if (!isDragging.current && !commitTimer.current) {
      setLocalValue(value);
    }
  }, [value]);

  const handleEditStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isDragging.current) {
      setLocalConstraints({ min, max, step });
      setIsEditingParams(true);
    }
  };

  const handleParamChange = (param: 'min' | 'max' | 'step', newValue: number) => {
    const newConstraints = {
      ...localConstraints,
      [param]: param === 'step' ? Math.max(0.01, newValue) : newValue,
    };
    setLocalConstraints(newConstraints);
  };

  const handleParamConfirm = () => {
    if (onConstraintsChange) {
      console.log('确认约束更改:', localConstraints); // 调试日志
      onConstraintsChange(localConstraints);
    }
    setIsEditingParams(false);
  };

  const handleParamCancel = () => {
    setLocalConstraints({ min, max, step });
    setIsEditingParams(false);
  };

  // 计算进度条百分比，使用本地值
  const percentage = max > min ? ((localValue - min) / (max - min)) * 100 : 0;

  // 格式化显示值，避免浮点数精度问题
  const formatValue = (val: number | string) => {
    // 确保val是数字类型
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    
    // 检查是否为有效数字
    if (isNaN(numVal)) {
      return '0';
    }
    
    if (step < 1) {
      const decimals = step.toString().split('.')[1]?.length || 0;
      return numVal.toFixed(decimals);
    }
    return numVal.toString();
  };

  // 处理内联编辑的键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleParamConfirm();
    } else if (e.key === 'Escape') {
      handleParamCancel();
    }
  };

  return (
    <div className="variable-control variable-slider">
      <div className="variable-label">
        <span className="variable-name">{name}:</span>
      </div>
      
      {isEditingParams ? (
        // 参数编辑模式：最小_____ - _____最大 步长_______ [完成] [取消]
        <div 
          className={`slider-inline-edit ${isEditingParams ? 'visible' : ''}`}
          onKeyDown={handleKeyDown}
        >
          <span className="inline-edit-label">最小</span>
          <input
            type="number"
            value={localConstraints.min}
            onChange={(e) => handleParamChange('min', parseFloat(e.target.value) || 0)}
            className="inline-edit-input"
            step="0.1"
            autoFocus
          />
          <span className="inline-edit-separator">-</span>
          <input
            type="number"
            value={localConstraints.max}
            onChange={(e) => handleParamChange('max', parseFloat(e.target.value) || 100)}
            className="inline-edit-input"
            step="0.1"
          />
          <span className="inline-edit-label">最大</span>
          <span className="inline-edit-label">步长</span>
          <input
            type="number"
            value={localConstraints.step}
            onChange={(e) => handleParamChange('step', parseFloat(e.target.value) || 1)}
            className="inline-edit-input"
            step="0.01"
            min="0.01"
          />
          <button 
            className="edit-done-btn"
            onMouseDown={handleParamConfirm}
            title="确认 (Enter)"
          >
            ✓
          </button>
          <button 
            className="edit-cancel-btn"
            onMouseDown={handleParamCancel}
            title="取消 (Escape)"
          >
            ✕
          </button>
        </div>
      ) : (
        // 正常滑动条模式
        <div className="slider-container">
          <div className="slider-track">
            <div 
              className="slider-progress" 
              style={{ width: `${percentage}%` }}
            />
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={localValue} // 使用本地值
              onChange={handleChange}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              className="slider-input"
              title={`当前值: ${formatValue(localValue)} (${min}-${max}, 步长${step})`}
            />
          </div>
          <div 
            className="variable-value" 
            onMouseDown={handleEditStart} 
            title="按下编辑参数"
          >
            {formatValue(localValue)}
          </div>
        </div>
      )}
    </div>
  );
};

export default Slider; 