import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, useConnection } from '@xyflow/react';
import './styles.css';
import { useToolStore } from '../../store/toolStore';

export type TextNodeData = {
  label: string;
  result?: string;
  initialEditing?: boolean;
};

export type TextNodeType = Node<TextNodeData, 'text'>;

const TextNode: React.FC<NodeProps<TextNodeType>> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);

  // 初始化时需要通过 useEffect 来进行一次 isEditing 的状态切换，这样才能触发编辑态 textarea 的自动聚焦。
  // 实验发现，如果直接在组件的 state 中设置 isEditing 为 true，则无法触发自动聚焦。
  useEffect(() => {
    console.log('data.initialEditing', data.initialEditing);
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
    if (e.key === 'Enter' && e.shiftKey) {
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

  return (
    <div className={`text-node${selected ? ' selected' : ''}${isEditing ? ' editing' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: activeTool === 'text' ? 'text' : activeTool === 'select' ? 'pointer' : undefined }}
    >
      {/* 节点内容 */}
      {isEditing ? (
        <textarea
          className="text-node-editor nodrag code-font"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="// 在此输入代码"
          rows={2}
          style={{ minHeight: '1em', overflow: 'hidden', resize: 'none' }}
          ref={el => {
            if (el) {
              el.style.height = '1em';
              el.style.height = el.scrollHeight + 'px'; // Cursor的奇技淫巧
            }
          }}
        />
      ) : (
        <div className="text-node-content code-font">
          {text ? (
            <pre>{text}</pre>
          ) : (
            <pre style={{ color: 'rgba(160, 236, 255, 0.35)' }}>// 在此输入代码</pre>
          )}
        </div>
      )}
      {data.result && (
        <>
          <div className="text-node-divider" />
          <div className="text-node-result code-font">
            {data.result}
          </div>
        </>
      )}
      {/* 始终渲染 handle，非连接模式时加 hide-handle 类隐藏 */}
      <Handle
        type="source"
        position={Position.Right}
        id="main"
        className={`text-node-handle${!(activeTool === 'connect' && !connection?.inProgress) ? ' hide-handle' : ''}`}
        isConnectable={activeTool === 'connect' && !connection?.inProgress}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="main"
        className={`text-node-handle${!(activeTool === 'connect' && (!connection?.inProgress || isTarget)) ? ' hide-handle' : ''}`}
        isConnectable={activeTool === 'connect' && (!connection?.inProgress || isTarget)}
        isConnectableStart={false}
      />
    </div>
  );
};

export default TextNode;