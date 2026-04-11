import type React from 'react';

export interface CodeEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onExitEdit: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export type CodeEditorComponent = React.FC<CodeEditorProps>;

