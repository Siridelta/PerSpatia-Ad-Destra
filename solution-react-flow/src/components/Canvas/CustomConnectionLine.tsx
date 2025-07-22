import React from 'react';
import { getStraightPath } from '@xyflow/react';

interface CustomConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  connectionLineStyle?: React.CSSProperties;
}

const CustomConnectionLine: React.FC<CustomConnectionLineProps> = ({ fromX, fromY, toX, toY, connectionLineStyle }) => {
  const [edgePath] = getStraightPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
  });

  return (
    <g>
      <path
        style={connectionLineStyle}
        fill="none"
        d={edgePath}
        markerEnd="url(#custom-edge-arrow)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};

export default CustomConnectionLine; 