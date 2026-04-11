import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import CanvasV0 from './variants/v0-legacy/components/Canvas';
import CanvasV1 from './variants/v1-math-scifi/components/Canvas';
import VariantsIndex from './variants';
import TestPages from './test-pages';
import FloatingSelector from './test-pages/components/FloatingSelector';
import './App.css';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/noto-sans-sc/400.css';

const App: React.FC = () => {
  return (
    <Router>
      <div className="app-container">
        {/* 浮动选择器 */}
        <FloatingSelector />

        {/* 页面内容 */}
        <Routes>
          {/* 画廊入口 */}
          <Route path="/" element={<VariantsIndex />} />
          
          {/* V0 变体（旧版基线） */}
          <Route path="/v0" element={
            <ReactFlowProvider>
              <CanvasV0 />
            </ReactFlowProvider>
          } />

          {/* V1 变体（理科科幻 Math Sci-Fi） */}
          <Route path="/v1" element={
            <ReactFlowProvider>
              <CanvasV1 />
            </ReactFlowProvider>
          } />

          {/* 测试页面 */}
          <Route path="/test/*" element={<TestPages />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
