import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas';
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
          <Route path="/" element={
            <ReactFlowProvider>
              <Canvas />
            </ReactFlowProvider>
          } />
          <Route path="/test/*" element={<TestPages />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
