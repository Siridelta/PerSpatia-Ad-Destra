import React from 'react';

import type { CodeEditorProps } from './code-editor/types';
import { DualLayerCodeEditor } from './code-editor';

export const CodeEditor: React.FC<CodeEditorProps> = (props) => {
  return <DualLayerCodeEditor {...props} />;
};

export default CodeEditor;