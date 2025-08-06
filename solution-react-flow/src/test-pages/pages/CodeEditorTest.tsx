import React, { useState } from 'react';
import CodeEditor from '../../components/CodeEditor';
import './TestPage.css';

const CodeEditorTest: React.FC = () => {
  const [code, setCode] = useState(`// 简单的代码示例
const message = "Hello, Code Editor!";
console.log(message);

function calculateSum(a, b) {
  return a + b;
}

const result = calculateSum(5, 3);
node_output("sum", result);`);

  const [isEditing, setIsEditing] = useState(false);

  const handleTextChange = (newText: string) => {
    setCode(newText);
    console.log('代码已更新:', newText);
  };

  const handleExitEdit = () => {
    setIsEditing(false);
    console.log('退出编辑模式');
  };

  return (
    <div className="test-page-container">
      <div className="page-content">
        <div className="page-header">
          <h1>代码编辑器测试</h1>
          <p>测试新的 CodeEditor 组件</p>
        </div>

        <div className="test-layout">
          {/* 左侧控制面板 */}
          <div className="control-panel">
            <div className="test-info">
              <h3>测试说明</h3>
              <ul>
                <li>双击代码区域进入编辑模式</li>
                <li>点击代码区域定位光标</li>
                <li>Shift+Enter 或 Escape 退出编辑</li>
                <li>支持语法高亮</li>
                <li>自动调整尺寸</li>
              </ul>
            </div>

            <div className="test-controls">
              <h3>测试控制</h3>
              <button 
                onClick={() => setCode('// 重置为简单代码\nconst x = 1;\nconsole.log(x);')}
                className="test-button"
              >
                重置代码
              </button>
              <button 
                onClick={() => setCode(`// 长代码测试
const veryLongVariableNameThatExceedsNormalWidth = "这是一个非常长的变量名，用来测试节点的自动宽度调整功能";
const anotherLongVariable = "另一个很长的变量名";
console.log("测试很长的代码行");
console.log("第二行测试代码");
console.log("第三行测试代码");
node_output("result", veryLongVariableNameThatExceedsNormalWidth);`)}
                className="test-button"
              >
                长代码测试
              </button>
              <button 
                onClick={() => setCode(`// 多行函数测试
function complexFunction() {
  const result = [];
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      result.push(i * 2);
    } else {
      result.push(i * 3);
    }
  }
  return result;
}

const output = complexFunction();
console.log("复杂函数结果:", output);
node_output("array", output);`)}
                className="test-button"
              >
                复杂代码测试
              </button>
            </div>

            <div className="current-status">
              <h3>当前状态</h3>
              <p>编辑模式: {isEditing ? '开启' : '关闭'}</p>
              <p>代码长度: {code.length} 字符</p>
              <p>行数: {code.split('\n').length}</p>
            </div>
          </div>

          {/* 右侧测试区域 */}
          <div className="test-area">
            <div className="test-section">
              <h3>代码编辑器</h3>
              <div className="editor-container">
                <CodeEditor
                  initialText={code}
                  onTextChange={handleTextChange}
                  onExitEdit={handleExitEdit}
                  style={{
                    minHeight: '200px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: '#f8f9fa'
                  }}
                />
              </div>
            </div>

            <div className="test-section">
              <h3>代码输出</h3>
              <div className="output-container">
                <pre>{code}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeEditorTest; 