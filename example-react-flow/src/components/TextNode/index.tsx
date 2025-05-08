import React, { useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import './styles.css';

interface TextNodeData {
  label: string;
  result?: string;
}

const TextNode: React.FC<NodeProps<TextNodeData>> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');

  // 处理双击事件，进入编辑模式
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  // 处理文本变化
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  // 处理编辑完成
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // 这里可以添加保存文本的逻辑
    data.label = text;
  }, [text, data]);

  // 处理按键事件，按下Enter键完成编辑
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setIsEditing(false);
      data.label = text;
    }
  }, [text, data]);

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
        />
      ) : (
        <div className="text-node-content" onDoubleClick={handleDoubleClick}>
          <pre>{text}</pre>
          {data.result && <div className="text-node-result">{data.result}</div>}
        </div>
      )}
    </div>
  );
};

export default TextNode;