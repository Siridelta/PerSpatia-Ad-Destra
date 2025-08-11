import React from 'react';
import { EdgeProps, getStraightPath, useInternalNode } from '@xyflow/react';


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

const FloatingEdge: React.FC<EdgeProps> = ({ id, source, target, style, selected }) => {
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
    <>
      {/* 主要边路径 */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          ...style,
          stroke: selected ? 'rgba(100, 200, 255, 0.8)' : 'rgb(88, 88, 88)',
          strokeWidth: selected ? 4 : 2,
        }}
      />
      {/* 增加点击区域，便于选中 */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        stroke="transparent"
        strokeWidth={10}
        className="react-flow__edge-interaction"
      />
    </>
  );
};

export default FloatingEdge;