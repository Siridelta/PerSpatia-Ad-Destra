import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SizingBehaviorTest from './pages/SizingBehaviorTest';
import TextareaCursorTest from './pages/TextareaCursorTest';
import CodeEditorTest from './pages/CodeEditorTest';

const TestPages: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sizing-behavior" replace />} />
      <Route path="/sizing-behavior" element={<SizingBehaviorTest />} />
      <Route path="/textarea-cursor-test" element={<TextareaCursorTest />} />
      <Route path="/code-editor-test" element={<CodeEditorTest />} />
    </Routes>
  );
};

export default TestPages; 