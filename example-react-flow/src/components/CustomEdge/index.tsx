import React from 'react';
import { getBezierPath, EdgeProps, Position } from 'reactflow';

// 计算最佳连接点位置
const calculateOptimalHandlePositions = (sourceX: number, sourceY: number, targetX: number, targetY: number) => {
  // 计算源节点和目标节点之间的角度
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
  
  // 根据角度确定最佳的连接点位置
  let sourcePosition: Position;
  let targetPosition: Position;
  
  // 将角度转换为0-360度
  const degrees = (angle * 180) / Math.PI;
  const normalizedDegrees = degrees < 0 ? degrees + 360 : degrees;
  
  // 根据角度确定源节点的最佳连接点位置
  if (normalizedDegrees >= 315 || normalizedDegrees < 45) {
    sourcePosition = Position.Right;
  } else if (normalizedDegrees >= 45 && normalizedDegrees < 135) {
    sourcePosition = Position.Bottom;
  } else if (normalizedDegrees >= 135 && normalizedDegrees < 225) {
    sourcePosition = Position.Left;
  } else {
    sourcePosition = Position.Top;
  }
  
  // 目标节点的连接点位置与源节点相反
  if (sourcePosition === Position.Right) {
    targetPosition = Position.Left;
  } else if (sourcePosition === Position.Bottom) {
    targetPosition = Position.Top;
  } else if (sourcePosition === Position.Left) {
    targetPosition = Position.Right;
  } else {
    targetPosition = Position.Bottom;
  }
  
  return { sourcePosition, targetPosition };
};

const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) => {
  // 如果没有提供连接点位置，则计算最佳连接点位置
  if (!sourcePosition || !targetPosition) {
    const positions = calculateOptimalHandlePositions(sourceX, sourceY, targetX, targetY);
    sourcePosition = positions.sourcePosition;
    targetPosition = positions.targetPosition;
  }

  // 使用 getBezierPath 创建贝塞尔曲线路径
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
    />
  );
};

export default CustomEdge;