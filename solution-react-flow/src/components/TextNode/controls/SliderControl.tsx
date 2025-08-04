import React, { useState } from 'react';

export interface SliderControlProps {
  control: {
    name: string;
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: number;
  };
  value: number;
  onChange: (name: string, value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({ control, value, onChange }) => {
  const min = control.min ?? 0;
  const max = control.max ?? 100;
  const step = control.step ?? 1;
  const progress = ((value - min) / (max - min)) * 100;
  
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [sliderSettings, setSliderSettings] = useState({
    min,
    max,
    step
  });

  // 处理数值点击 - 切换到设置界面
  const handleValueClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isEditingSettings) {
      setIsEditingSettings(false);
    } else {
      setIsEditingSettings(true);
      setSliderSettings({ min, max, step });
    }
  };

  // 处理数值右键清空
  const handleValueRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(control.name, control.defaultValue || 0);
  };

  // 应用滑动条设置
  const applySliderSettings = () => {
    // 确保当前值在新范围内
    const newValue = Math.max(sliderSettings.min, Math.min(sliderSettings.max, value));
    if (newValue !== value) {
      onChange(control.name, newValue);
    }
    setIsEditingSettings(false);
  };

  // 处理滑动条输入变化
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newValue = parseFloat(e.target.value);
    onChange(control.name, newValue);
  };

  // 处理鼠标按下事件，防止拖动冲突
  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // 处理滑动条释放，移除焦点以恢复键盘响应
  const handleSliderMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).blur();
  };

  // 如果正在编辑设置，显示设置面板
  if (isEditingSettings) {
    return (
      <div className="slider-settings-panel nodrag">
        <div className="slider-settings-row">
          <span>最小</span>
          <input
            type="number"
            value={sliderSettings.min}
            onChange={(e) => setSliderSettings(prev => ({ ...prev, min: parseFloat(e.target.value) || 0 }))}
            className="slider-settings-input"
            placeholder="0"
          />
          <span>-</span>
          <input
            type="number"
            value={sliderSettings.max}
            onChange={(e) => setSliderSettings(prev => ({ ...prev, max: parseFloat(e.target.value) || 100 }))}
            className="slider-settings-input"
            placeholder="100"
          />
          <span>最大</span>
        </div>
        <div className="slider-settings-row">
          <span>步长</span>
          <input
            type="number"
            value={sliderSettings.step}
            onChange={(e) => setSliderSettings(prev => ({ ...prev, step: parseFloat(e.target.value) || 1 }))}
            className="slider-settings-input"
            placeholder="1"
          />
          <button
            onClick={applySliderSettings}
            style={{
              background: '#014a64',
              color: '#ffffff',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, AlimamaFangYuanTi, monospace',
              fontSize: '14px'
            }}
          >
            确定
          </button>
        </div>
      </div>
    );
  }

  // 正常的滑动条显示
  return (
    <div className="slider-container nodrag">
      <div className="slider-layout">
        <span 
          className="slider-min-value"
          onClick={handleValueClick}
          style={{ cursor: 'pointer', color: '#7de1ea', margin: '0 8px' }}
          title="点击设置范围"
        >
          {min}
        </span>
        <div className="slider-track-wrapper">
          <div className="slider-track" onMouseDown={handleSliderMouseDown} onMouseUp={handleSliderMouseUp}>
            <div 
              className="slider-progress" 
              style={{ width: `${progress}%` }}
            ></div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={handleSliderChange}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              className="slider-input"
            />
          </div>
        </div>
        <span 
          className="slider-max-value"
          onClick={handleValueClick}
          style={{ cursor: 'pointer', color: '#7de1ea', margin: '0 8px' }}
          title="点击设置范围"
        >
          {max}
        </span>
        <span 
          className="slider-current-value"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const newValue = prompt(`设置 ${control.name} 的值:`, String(value));
            if (newValue !== null && !isNaN(Number(newValue))) {
              const numValue = Math.max(min, Math.min(max, Number(newValue)));
              onChange(control.name, numValue);
            }
          }}
          onContextMenu={handleValueRightClick}
          style={{ cursor: 'pointer', color: '#7de1ea' }}
          title="左键直接设置值，右键重置"
        >
          {value}
        </span>
      </div>
    </div>
  );
};

export default SliderControl; 