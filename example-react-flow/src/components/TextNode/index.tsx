import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps, useConnection } from '@xyflow/react';
import './styles.css';
import { useToolStore } from '../../store/toolStore';

interface TextNodeData {
  label: string;
  result?: string;
  initialEditing?: boolean;
}

const TextNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const textData = (data as unknown) as TextNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(textData.label || '');
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);

  // 初始化时需要通过 useEffect 来进行一次 isEditing 的状态切换，这样才能触发编辑态 textarea 的自动聚焦。
  // 实验发现，如果直接在组件的 state 中设置 isEditing 为 true，则无法触发自动聚焦。
  useEffect(() => {
    if (textData.initialEditing) {
      setIsEditing(true);
    }
  }, [textData.initialEditing]);

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
    textData.label = text;
    if (textData.initialEditing) {
      delete textData.initialEditing;
    }
  }, [text, textData]);

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

  // 处理单击事件：文本模式下单击直接编辑
  const handleClick = useCallback(() => {
    if (activeTool === 'text' && !isEditing) {
      setIsEditing(true);
      setActiveTool('select');
    }
  }, [activeTool, isEditing, setActiveTool]);

  // 连接状态钩子，仿照 easy-connect
  const connection = useConnection && useConnection();
  const isTarget = connection?.inProgress && connection.fromNode.id !== id;

  const showHandles = activeTool === 'connect';

  return (
    <div className={`text-node ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      style={{ cursor: activeTool === 'text' ? 'text' : activeTool === 'select' ? 'pointer' : undefined }}
    >
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
          {textData.result && <div className="text-node-result">{textData.result}</div>}
        </div>
      )}
      {/* 动态渲染 handle，仿照 easy-connect */}
      {showHandles && !connection?.inProgress && (
        <Handle
          type="source"
          position={Position.Right}
          id="main"
          className="text-node-handle"
          isConnectable={true}
        />
      )}
      {showHandles && (!connection?.inProgress || isTarget) && (
        <Handle
          type="target"
          position={Position.Left}
          id="main"
          className="text-node-handle"
          isConnectable={true}
          isConnectableStart={false}
        />
      )}
    </div>
  );
};

export default TextNode;