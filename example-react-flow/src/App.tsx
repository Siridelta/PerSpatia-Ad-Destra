import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas';
import './App.css';

const App: React.FC = () => {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
};

export default App;
