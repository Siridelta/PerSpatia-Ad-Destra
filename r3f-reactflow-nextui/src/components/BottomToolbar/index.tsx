import React from 'react';
import './styles.css';
import { useToolStore } from '@/store/toolStore';

interface BottomToolbarProps {
  onSettingsClick: () => void;
  onExport?: () => void;
  onImportReplace?: () => void;
  onImportAdd?: () => void;
  onReset?: () => void;
}

const BottomToolbar: React.FC<BottomToolbarProps> = ({ 
  onSettingsClick, 
  onExport, 
  onImportReplace, 
  onImportAdd,
  onReset
}) => {
  const { activeTool, setActiveTool, connectionStartNode, setConnectionStartNode } = useToolStore();

  const handleModeChange = (mode: 'select' | 'connect') => {
    setActiveTool(mode);
    if (mode !== 'connect') {
      // 切换到其他模式时清除连接状态
      setConnectionStartNode(null);
    }
  };

  return (
    <div className="bottom-toolbar">
      {/* 左侧模式选择器 */}
      <div className="mode-selector">
        <button
          className={`mode-button ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => handleModeChange('select')}
          title="常规模式 (V)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" />
          </svg>
          <span>常规</span>
        </button>
        <button
          className={`mode-button ${activeTool === 'connect' ? 'active' : ''} ${connectionStartNode ? 'connecting' : ''}`}
          onClick={() => handleModeChange('connect')}
          title="连接模式 (C)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" />
          </svg>
          <span>
            {connectionStartNode ? '选择目标节点' : '连接'}
          </span>
        </button>
      </div>

      {/* 中间导入导出功能区 */}
      <div className="import-export-section">
        <button
          className="utility-button"
          onClick={onExport}
          title="导出画布"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          <span>导出</span>
        </button>
        
        <div className="import-dropdown">
          <button
            className="utility-button dropdown-trigger"
            title="导入选项"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,12L16,16H13.5V19H10.5V16H8L12,12Z" />
            </svg>
            <span>导入</span>
            <svg viewBox="0 0 24 24" width="12" height="12" className="dropdown-arrow">
              <path fill="currentColor" d="M7,10L12,15L17,10H7Z" />
            </svg>
          </button>
          
          <div className="import-dropdown-menu">
            <button
              className="dropdown-item"
              onClick={onImportReplace}
              title="替换当前画布内容"
            >
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V5H19V19M17,17H7V7H17V17Z" />
              </svg>
              <span>替换画布</span>
            </button>
            <button
              className="dropdown-item"
              onClick={onImportAdd}
              title="添加到当前画布"
            >
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
              </svg>
              <span>添加节点</span>
            </button>
          </div>
        </div>
        {/* 重置按钮，快速恢复默认画布 */}
        <button
          className="utility-button"
          onClick={onReset}
          title="重置为默认画布"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12,5V2L8,6L12,10V7A5,5 0 0,1 17,12C17,13 16.75,13.94 16.3,14.75L17.76,16.21C18.5,15.07 19,13.6 19,12A7,7 0 0,0 12,5M6.24,7.79C5.5,8.93 5,10.4 5,12A7,7 0 0,0 12,19V22L16,18L12,14V17A5,5 0 0,1 7,12C7,11 7.25,10.06 7.7,9.25L6.24,7.79Z" />
          </svg>
          <span>重置</span>
        </button>
      </div>

      {/* 右侧设置按钮 */}
      <div className="settings-section">
        <button
          className="settings-button"
          onClick={onSettingsClick}
          title="设置"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11.03L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11.03L19.5,12L19.43,12.97L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z" />
          </svg>
          <span>设置</span>
        </button>
      </div>
    </div>
  );
};

export default BottomToolbar; 