import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import './styles.css';

interface TextNodeData {
  label: string;
  result?: string;
  initialEditing?: boolean;
}

const TextNode: React.FC<NodeProps<TextNodeData>> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');

  useEffect(() => {
    if (data.initialEditing) {
      setIsEditing(true);
    }
  }, [data.initialEditing]);

  // 处理双击事件，进入编辑模式
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  // 处理文本变化
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  // 退出编辑状态的复用逻辑
  const exitEdit = useCallback(() => {
    setIsEditing(false);
    data.label = text;
    if (data.initialEditing) {
      delete data.initialEditing;
    }
  }, [text, data]);

  // 处理编辑完成
  const handleBlur = useCallback(() => {
    exitEdit();
  }, [exitEdit]);

  // 处理按键事件，按下Enter键完成编辑
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      exitEdit();
    }
  }, [exitEdit]);

  return (
    <div className={`text-node ${selected ? 'selected' : ''}`}>
      {/* 隐藏的 handle，id 统一为 'main'，用于支持无锚点连接 */}
      <Handle type="source" position={Position.Right} id="main" style={{ opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
      <Handle type="target" position={Position.Left} id="main" style={{ opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
      {/* 节点内容 */}
      {isEditing ? (
        <textarea
          className="text-node-editor"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="// 在此输入代码"
        />
      ) : (
        <div className="text-node-content" onDoubleClick={handleDoubleClick}>
          {text ? (
            <pre>{text}</pre>
          ) : (
            <pre style={{ color: '#bbb' }}>// 在此输入代码</pre>
          )}
          {data.result && <div className="text-node-result">{data.result}</div>}
        </div>
      )}
    </div>
  );
};

export default TextNode;