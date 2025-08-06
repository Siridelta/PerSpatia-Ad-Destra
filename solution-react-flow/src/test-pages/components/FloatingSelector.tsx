import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import './FloatingSelector.css';

const FloatingSelector: React.FC = () => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* 浮动导航按钮 */}
      <div className="floating-nav">
        <button 
          className={`nav-toggle ${isNavOpen ? 'active' : ''}`}
          onClick={() => setIsNavOpen(!isNavOpen)}
          title="页面导航"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" />
          </svg>
        </button>
        
        {/* 导航面板 */}
        <div className={`nav-panel ${isNavOpen ? 'open' : ''}`}>
          <div className="nav-header">
            <h3>页面导航</h3>
            <button 
              className="nav-close"
              onClick={() => setIsNavOpen(false)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
              </svg>
            </button>
          </div>
          
          <div className="nav-scenarios">
            <a href="/" className={`nav-scenario ${location.pathname === '/' ? 'active' : ''}`}>
              <div className="scenario-title">主画布</div>
              <div className="scenario-description">Desmos风格的可视化编程画布</div>
            </a>
            <a href="/test/sizing-behavior" className={`nav-scenario ${location.pathname === '/test/sizing-behavior' ? 'active' : ''}`}>
              <div className="scenario-title">尺寸行为测试</div>
              <div className="scenario-description">测试节点自动调整尺寸</div>
            </a>
            <a href="/test/textarea-cursor-test" className={`nav-scenario ${location.pathname === '/test/textarea-cursor-test' ? 'active' : ''}`}>
              <div className="scenario-title">光标定位测试</div>
              <div className="scenario-description">测试1x1px透明textarea的光标裁剪</div>
            </a>
            <a href="/test/code-editor-test" className={`nav-scenario ${location.pathname === '/test/code-editor-test' ? 'active' : ''}`}>
              <div className="scenario-title">代码编辑器测试</div>
              <div className="scenario-description">测试新的 CodeEditor 组件</div>
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default FloatingSelector; 