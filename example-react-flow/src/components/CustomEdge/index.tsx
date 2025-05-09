import React from 'react';
import { getBezierPath, EdgeProps, Position, getStraightPath, useInternalNode } from '@xyflow/react';

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

// getEdgeParams 逻辑迁移自 sandbox-easy-connect/utils.js
function getNodeIntersection(intersectionNode: any, targetNode: any) {
  const { width: intersectionNodeWidth, height: intersectionNodeHeight } = intersectionNode.measured;
  const intersectionNodePosition = intersectionNode.internals.positionAbsolute;
  const targetPosition = targetNode.internals.positionAbsolute;

  const w = intersectionNodeWidth / 2;
  const h = intersectionNodeHeight / 2;

  const x2 = intersectionNodePosition.x + w;
  const y2 = intersectionNodePosition.y + h;
  const x1 = targetPosition.x + targetNode.measured.width / 2;
  const y1 = targetPosition.y + targetNode.measured.height / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

function getEdgeParams(source: any, target: any) {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
  };
}

const markerId = 'custom-edge-arrow';

const FloatingEdge: React.FC<EdgeProps> = ({ id, source, target, markerEnd, style }) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty } = getEdgeParams(sourceNode, targetNode);

  const [edgePath] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M2,2 L8,5 L2,8 L4,5 L2,2" fill="#b1b1b7" />
        </marker>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={`url(#${markerId})`}
        style={style}
      />
    </g>
  );
};

export default FloatingEdge;