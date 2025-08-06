import React, { useState } from 'react';
import './TestPage.css';

const TextareaCursorTest: React.FC = () => {
  const [testText, setTestText] = useState('测试光标定位\n第二行\n第三行');
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="test-page-container">
      {/* 页面内容 */}
      <div className="page-content">
        <div className="page-header">
          <h1>光标定位测试</h1>
          <p>测试1x1px透明textarea的光标裁剪问题</p>
        </div>

        <div className="test-layout">
          {/* 左侧控制面板 */}
          <div className="control-panel">
            <div className="test-info">
              <h3>测试说明</h3>
              <ul>
                <li>测试小尺寸textarea的光标行为</li>
                <li>验证光标定位的准确性</li>
                <li>检查文本选择功能</li>
                <li>测试不同尺寸textarea的对比</li>
              </ul>
            </div>

            <div className="test-controls">
              <h4>测试场景</h4>
              <button onClick={() => setShowDebug(!showDebug)}>
                {showDebug ? '隐藏' : '显示'}调试信息
              </button>
              <button onClick={() => setTestText('新的测试文本\n包含多行内容\n用于测试光标行为')}>
                更新文本
              </button>
              <button onClick={() => setTestText('')}>
                清空文本
              </button>
            </div>

            <div className="code-display">
              <h4>当前文本</h4>
              <div className="code-preview">
                <pre>{testText}</pre>
              </div>
            </div>

            {showDebug && (
              <div className="debug-info">
                <h4>调试信息</h4>
                <p>文本长度: {testText.length}</p>
                <p>行数: {testText.split('\n').length}</p>
                <p>光标位置: 点击textarea查看</p>
                <p>选择范围: {window.getSelection()?.toString() || '无'}</p>
              </div>
            )}
          </div>

          {/* 右侧测试容器 */}
          <div className="node-container">
            <div className="container-header">
              <h3>Textarea 测试区域</h3>
              <p>观察不同尺寸textarea的光标行为</p>
            </div>
            <div className="node-display-area">
              {/* 1x1px透明textarea测试 */}
              <div className="test-case">
                <h4>1x1px 透明 textarea</h4>
                <textarea
                  className="tiny-textarea"
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  style={{
                    width: '1px',
                    height: '1px',
                    opacity: 0,
                    position: 'absolute',
                    top: '-9999px'
                  }}
                />
                <div className="visible-textarea">
                  <textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="可见的textarea用于对比"
                    style={{
                      width: '300px',
                      height: '150px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '14px',
                      background: 'rgba(9, 14, 28, 0.8)',
                      color: '#7de1ea',
                      border: '1px solid rgba(125, 225, 234, 0.3)',
                      borderRadius: '4px',
                      padding: '8px'
                    }}
                  />
                </div>
              </div>

              {/* 不同尺寸的textarea测试 */}
              <div className="test-case">
                <h4>不同尺寸测试</h4>
                <div className="textarea-grid">
                  <div>
                    <label>2x2px</label>
                    <textarea
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      style={{
                        width: '2px',
                        height: '2px',
                        opacity: 0.5,
                        border: '1px solid red'
                      }}
                    />
                  </div>
                  <div>
                    <label>5x5px</label>
                    <textarea
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      style={{
                        width: '5px',
                        height: '5px',
                        opacity: 0.5,
                        border: '1px solid orange'
                      }}
                    />
                  </div>
                  <div>
                    <label>10x10px</label>
                    <textarea
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      style={{
                        width: '10px',
                        height: '10px',
                        opacity: 0.5,
                        border: '1px solid yellow'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextareaCursorTest; 