import React, { useCallback, useRef, useEffect } from 'react';
import './styles.css';
import { useSettingsStore } from '../../store/settingsStore';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const {
    colors,
    fonts,
    setColor,
    setFont,
    resetToDefaults,
  } = useSettingsStore();

  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // 只有当点击位置在面板右侧的特定区域时才关闭
        const clickX = event.clientX;
        const panelRect = panelRef.current.getBoundingClientRect();
        
        // 如果点击位置在面板右边缘右侧100px以上，则关闭面板
        if (clickX > panelRect.right + 100) {
          onClose();
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // 阻止面板内部点击事件冒泡
  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // 颜色输入处理
  const handleColorChange = useCallback((key: keyof typeof colors, value: string) => {
    setColor(key, value);
  }, [setColor]);

  // 字体大小滑动条处理
  const handleFontSizeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newSize = parseInt(e.target.value);
    setFont('size', newSize);
  }, [setFont]);

  // 字体选择处理
  const handleFontFamilyChange = useCallback((key: 'primary' | 'code', value: string) => {
    setFont(key, value);
  }, [setFont]);

  // 重置按钮处理
  const handleReset = useCallback(() => {
    resetToDefaults();
  }, [resetToDefaults]);

  if (!isOpen) return null;

  return (
    <div className="settings-panel-overlay">
      <div 
        ref={panelRef}
        className="settings-panel nodrag"
        onClick={handlePanelClick}
      >
        {/* 面板头部 */}
        <div className="settings-panel-header">
          <h3 className="settings-title">设置</h3>
          <button className="close-button" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
            </svg>
          </button>
        </div>

        {/* 颜色设置区域 */}
        <div className="settings-section">
          <div className="section-label">
            卡片颜色
          </div>
          
          <div className="color-setting-group">
            <div className="color-setting-row">
              <span className="color-label">背景色</span>
              <div className="color-input-container">
                <input
                  type="color"
                  value={colors.cardBackground.replace(/rgba?\([^)]+\)/, '#090e1c')}
                  onChange={(e) => handleColorChange('cardBackground', `${e.target.value}80`)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={colors.cardBackground}
                  onChange={(e) => handleColorChange('cardBackground', e.target.value)}
                  className="text-input color-text-input"
                  placeholder="rgba(9, 14, 28, 0.5)"
                />
              </div>
            </div>

            <div className="color-setting-row">
              <span className="color-label">边框色</span>
              <div className="color-input-container">
                <input
                  type="color"
                  value="#7de1ea"
                  onChange={(e) => handleColorChange('cardBorder', `${e.target.value}4d`)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={colors.cardBorder}
                  onChange={(e) => handleColorChange('cardBorder', e.target.value)}
                  className="text-input color-text-input"
                  placeholder="rgba(125, 225, 234, 0.3)"
                />
              </div>
            </div>

            <div className="color-setting-row">
              <span className="color-label">文字色</span>
              <div className="color-input-container">
                <input
                  type="color"
                  value={colors.cardText}
                  onChange={(e) => handleColorChange('cardText', e.target.value)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={colors.cardText}
                  onChange={(e) => handleColorChange('cardText', e.target.value)}
                  className="text-input color-text-input"
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="color-setting-row">
              <span className="color-label">强调色</span>
              <div className="color-input-container">
                <input
                  type="color"
                  value={colors.cardAccent}
                  onChange={(e) => handleColorChange('cardAccent', e.target.value)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={colors.cardAccent}
                  onChange={(e) => handleColorChange('cardAccent', e.target.value)}
                  className="text-input color-text-input"
                  placeholder="#7de1ea"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 画布颜色设置 */}
        <div className="settings-section">
          <div className="section-label">
            画布颜色
          </div>
          
          <div className="color-setting-group">
            <div className="color-setting-row">
              <span className="color-label">背景色</span>
              <div className="color-input-container">
                <input
                  type="color"
                  value={colors.canvasBackground}
                  onChange={(e) => handleColorChange('canvasBackground', e.target.value)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={colors.canvasBackground}
                  onChange={(e) => handleColorChange('canvasBackground', e.target.value)}
                  className="text-input color-text-input"
                  placeholder="#0a0e1a"
                />
              </div>
            </div>

            <div className="color-setting-row">
              <span className="color-label">网格色</span>
              <div className="color-input-container">
                <input
                  type="color"
                  value="#7de1ea"
                  onChange={(e) => handleColorChange('canvasGrid', `${e.target.value}1a`)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={colors.canvasGrid}
                  onChange={(e) => handleColorChange('canvasGrid', e.target.value)}
                  className="text-input color-text-input"
                  placeholder="rgba(125, 225, 234, 0.1)"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 字体设置 */}
        <div className="settings-section">
          <div className="section-label">
            字体设置
          </div>
          
          <div className="font-setting-group">
            <div className="font-setting-row">
              <span className="font-label">主字体</span>
              <select
                value={fonts.primary}
                onChange={(e) => handleFontFamilyChange('primary', e.target.value)}
                className="font-select"
              >
                <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                <option value="Fira Code, monospace">Fira Code</option>
                <option value="Monaco, monospace">Monaco</option>
                <option value="Consolas, monospace">Consolas</option>
                <option value="'Courier New', monospace">Courier New</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="'Helvetica Neue', sans-serif">Helvetica Neue</option>
              </select>
            </div>

            <div className="font-setting-row">
              <span className="font-label">代码字体</span>
              <select
                value={fonts.code}
                onChange={(e) => handleFontFamilyChange('code', e.target.value)}
                className="font-select"
              >
                <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                <option value="Fira Code, monospace">Fira Code</option>
                <option value="Monaco, monospace">Monaco</option>
                <option value="Consolas, monospace">Consolas</option>
                <option value="'Courier New', monospace">Courier New</option>
              </select>
            </div>

            <div className="font-setting-row">
              <span className="font-label">字体大小</span>
              <div className="slider-container">
                <div className="slider-track">
                  <input
                    type="range"
                    min="10"
                    max="20"
                    step="1"
                    value={fonts.size}
                    onChange={handleFontSizeChange}
                    className="slider-input"
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <div 
                    className="slider-progress"
                    style={{ 
                      width: `${((fonts.size - 10) / (20 - 10)) * 100}%` 
                    }}
                  />
                </div>
                <span className="variable-value">{fonts.size}px</span>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="settings-actions">
          <button 
            className="reset-button"
            onClick={handleReset}
          >
            重置默认
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel; 