import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, useConnection, NodeResizeControl } from '@xyflow/react';
import './styles.css';
import { useToolStore } from '../../store/toolStore';

export type TextNodeData = {
  label: string;
  result?: string;
  initialEditing?: boolean;
};

export type TextNodeType = Node<TextNodeData, 'text'>;

// 宽度上下限常量
const TEXT_NODE_MIN_WIDTH = 150;
const TEXT_NODE_MAX_WIDTH = 800;

// 工具函数：将光标定位到指定页面坐标（x, y）处
function placeCaretAtPoint(x: number, y: number) {
  let range: Range | null = null;
  if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (range) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  }
  return false;
}

const TextNode: React.FC<NodeProps<TextNodeType>> = ({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.label || '');
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const [width, setWidth] = useState<number | undefined>(undefined);

  // 初始化时需要通过 useEffect 来进行一次 isEditing 的状态切换，这样才能触发编辑态 textarea 的自动聚焦。
  // 实验发现，如果直接在组件的 state 中设置 isEditing 为 true，则无法触发自动聚焦。
  useEffect(() => {
    console.log('data.initialEditing', data.initialEditing);
    if (data.initialEditing) {
      setIsEditing(true);
    }
  }, [data.initialEditing]);

  // 记录最近一次点击事件，用于进入编辑态时定位光标
  const lastPointerDown = React.useRef<{ x: number; y: number } | null>(null);

  // 处理双击事件，进入编辑模式
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 记录点击位置
    lastPointerDown.current = { x: e.clientX, y: e.clientY };
    setIsEditing(true);
  }, []);

  // 处理文本变化（contentEditable div）
  const handleDivInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    setText(e.currentTarget.innerText);
  }, []);

  // contentEditable div的ref，用于聚焦
  const editorRef = React.useRef<HTMLDivElement>(null);

  // 退出编辑状态的复用逻辑
  const exitEdit = useCallback(() => {
    setIsEditing(false);
    data.label = text;
    if (data.initialEditing) {
      delete data.initialEditing;
    }
  }, [text, data]);

  // 处理contentEditable的键盘事件
  const handleDivKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      exitEdit();
    }
  }, [exitEdit]);

  // 编辑态自动聚焦，并根据lastPointerDown定位光标
  useEffect(() => {
    if (isEditing && editorRef.current) {
      // 进入编辑态时初始化内容
      editorRef.current.innerText = text;
      editorRef.current.focus();
      if (lastPointerDown.current) {
        placeCaretAtPoint(lastPointerDown.current.x, lastPointerDown.current.y);
        lastPointerDown.current = null;
      } else {
        // 默认聚焦到末尾
        const el = editorRef.current;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [isEditing]);

  // 处理单击事件：文本模式下单击直接编辑
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'text' && !isEditing) {
      // 记录点击位置
      lastPointerDown.current = { x: e.clientX, y: e.clientY };
      setIsEditing(true);
      setActiveTool('select');
    }
  }, [activeTool, isEditing, setActiveTool]);

  // 连接状态钩子，仿照 easy-connect
  const connection = useConnection && useConnection();
  const isTarget = connection?.inProgress && connection.fromNode.id !== id;

  return (
    <div
      className={`text-node${selected ? ' selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        cursor: activeTool === 'text' ? 'text' : activeTool === 'select' ? 'pointer' : undefined,
      }}
    >
      {/* 左侧宽度调整控制 */}
      <NodeResizeControl
        position="left"
        resizeDirection='horizontal'
        minWidth={TEXT_NODE_MIN_WIDTH}
        maxWidth={TEXT_NODE_MAX_WIDTH}
        style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          width: 8,
          height: '100%',
          background: 'transparent',
          cursor: 'ew-resize',
          zIndex: 10,
          border: 'none',
        }}
      />
      {/* 右侧宽度调整控制 */}
      <NodeResizeControl
        position="right"
        resizeDirection='horizontal'
        minWidth={TEXT_NODE_MIN_WIDTH}
        maxWidth={TEXT_NODE_MAX_WIDTH}
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          width: 8,
          height: '100%',
          background: 'transparent',
          cursor: 'ew-resize',
          zIndex: 10,
          border: 'none',
        }}
      />
      {/* 节点内容 */}
      {isEditing ? (
        <div
          className="text-node-editor nodrag code-font"
          key="text"
          contentEditable
          ref={editorRef}
          suppressContentEditableWarning
          onInput={handleDivInput}
          onBlur={exitEdit}
          onKeyDown={handleDivKeyDown}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: '1em', outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all', cursor: 'text' }}
          spellCheck={false}
        />
      ) : (
        <div key="display" className="text-node-content code-font" style={{ width: '100%', boxSizing: 'border-box' }}>
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