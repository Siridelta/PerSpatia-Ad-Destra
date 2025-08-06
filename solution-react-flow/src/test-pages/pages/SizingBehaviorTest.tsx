import React, { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import TextNode from '../../components/TextNode';
import './TestPage.css';

const SizingBehaviorTest: React.FC = () => {
  const [testCode, setTestCode] = useState(`// 测试代码
const longVariableName = "这是一个很长的变量名";
const shortVar = "短变量";
console.log("测试日志输出");
node_output("result", longVariableName + shortVar);`);

  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleTestScenario = (scenario: string) => {
    setHasError(false);
    setErrorMessage('');
    
    switch (scenario) {
      case 'short':
        setTestCode(`// 短代码测试
const x = 1;`);
        break;
      case 'long':
        setTestCode(`// 长代码测试
const veryLongVariableNameThatExceedsNormalWidth = "这是一个非常长的变量名，用来测试节点的自动宽度调整功能";
const anotherLongVariable = "另一个很长的变量名";
const thirdLongVariable = "第三个长变量名";
console.log("测试很长的代码行");
console.log("第二行测试代码");
console.log("第三行测试代码");
node_output("result", veryLongVariableNameThatExceedsNormalWidth);
node_output("second", anotherLongVariable);
node_output("third", thirdLongVariable);`);
        break;
      case 'multiline':
        setTestCode(`// 多行代码测试
function calculateSum(numbers) {
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i];
  }
  return sum;
}

const result = calculateSum([1, 2, 3, 4, 5]);
console.log("计算结果:", result);
node_output("sum", result);`);
        break;
      case 'ultra-long':
        setTestCode(`// 超长单行测试
const extremelyLongVariableNameThatIsUsedToTestTheMaximumWidthLimitOfTheTextNodeComponent = "这是一个极其长的变量名，用来测试TextNode组件的最大宽度限制，看看它如何处理超长的单行代码";`);
        break;
      case 'error':
        setTestCode(`// 错误代码测试
const undefinedVariable = someUndefinedVariable;
const result = 10 / 0;
console.log("这行会导致错误");
node_output("error", result);`);
        setHasError(true);
        setErrorMessage('ReferenceError: someUndefinedVariable is not defined');
        break;
      case 'syntax-error':
        setTestCode(`// 语法错误测试
const x = 1;
const y = 2;
if (x > y {
  console.log("语法错误");
}
node_output("result", x + y);`);
        setHasError(true);
        setErrorMessage('SyntaxError: Unexpected token \'{\'');
        break;
    }
  };

  return (
    <div className="test-page-container">
      {/* 页面内容 */}
      <div className="page-content">
        <div className="page-header">
          <h1>尺寸行为测试</h1>
          <p>测试节点如何根据内容自动调整尺寸</p>
        </div>

        <div className="test-layout">
          {/* 左侧控制面板 */}
          <div className="control-panel">
            <div className="test-info">
              <h3>测试说明</h3>
              <ul>
                <li>测试短代码的尺寸调整</li>
                <li>测试长代码的尺寸调整</li>
                <li>验证自动宽度计算</li>
                <li>检查高度自适应</li>
                <li>测试错误消息显示</li>
              </ul>
            </div>

            <div className="test-controls">
              <h4>测试场景</h4>
              <button onClick={() => handleTestScenario('short')}>
                短代码
              </button>
              <button onClick={() => handleTestScenario('long')}>
                长代码
              </button>
              <button onClick={() => handleTestScenario('multiline')}>
                多行代码
              </button>
              <button onClick={() => handleTestScenario('ultra-long')}>
                超长单行
              </button>
              <button onClick={() => handleTestScenario('error')}>
                运行时错误
              </button>
              <button onClick={() => handleTestScenario('syntax-error')}>
                语法错误
              </button>
            </div>

            <div className="code-display">
              <h4>当前代码</h4>
              <div className="code-preview">
                <pre>{testCode}</pre>
              </div>
            </div>

            {hasError && (
              <div className="error-display">
                <h4>错误信息</h4>
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  <span className="error-text">{errorMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* 右侧TextNode容器 */}
          <div className="node-container">
            <div className="container-header">
              <h3>TextNode 渲染区域</h3>
              <p>观察节点的尺寸调整行为</p>
            </div>
            <div className="node-display-area">
              <ReactFlowProvider>
                <TextNode 
                  id="sizing-test-node"
                  data={{
                    label: testCode,
                    nodeName: '尺寸测试节点',
                    width: 600,
                    height: 500,
                    errors: hasError ? [{
                      message: errorMessage,
                      line: 1,
                      column: 1
                    }] : undefined
                  }}
                  selected={false}
                  type="text"
                  dragging={false}
                  zIndex={0}
                  selectable={true}
                  deletable={true}
                  draggable={true}
                  isConnectable={true}
                  positionAbsoluteX={0}
                  positionAbsoluteY={0}
                />
              </ReactFlowProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SizingBehaviorTest; 