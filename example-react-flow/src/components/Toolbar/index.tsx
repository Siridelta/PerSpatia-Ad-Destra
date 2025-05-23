import React from 'react';
import './styles.css';
import { useToolStore, ToolType } from '../../store/toolStore';

interface ToolbarProps {
  onImport?: () => void;
  onExport?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ onImport, onExport }) => {
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  return (
    <div className="toolbar">
      <button
        className={`toolbar-button ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => setActiveTool('select')}
        title="选择工具"
      >
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M7,2l12,11.2l-5.8,0.5l3.3,7.3l-2.2,1l-3.2-7.4L7,18.5V2z" />
        </svg>
      </button>
      <button
        className={`toolbar-button ${activeTool === 'text' ? 'active' : ''}`}
        onClick={() => setActiveTool('text')}
        title="文本工具"
      >
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M18.5,4L19.66,8.35L18.7,8.61C18.25,7.74 17.79,6.87 17.26,6.43C16.73,6 16.11,6 15.5,6H13V16.5C13,17 13,17.5 13.33,17.75C13.67,18 14.33,18 15,18V19H9V18C9.67,18 10.33,18 10.67,17.75C11,17.5 11,17 11,16.5V6H8.5C7.89,6 7.27,6 6.74,6.43C6.21,6.87 5.75,7.74 5.3,8.61L4.34,8.35L5.5,4H18.5Z" />
        </svg>
      </button>
      <button
        className={`toolbar-button ${activeTool === 'connect' ? 'active' : ''}`}
        onClick={() => setActiveTool('connect')}
        title="连接工具"
      >
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" />
        </svg>
      </button>
      <button className="toolbar-button" onClick={onExport} title="导出画布">
        导出
      </button>
      <button className="toolbar-button" onClick={onImport} title="导入画布">
        导入
      </button>
    </div>
  );
};

export default Toolbar;