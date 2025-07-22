import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas';
import './App.css';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/noto-sans-sc/400.css';

const App: React.FC = () => {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
};

export default App;
