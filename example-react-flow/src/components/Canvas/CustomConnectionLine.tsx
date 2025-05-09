import React from 'react';
import { getStraightPath } from '@xyflow/react';

interface CustomConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  connectionLineStyle?: React.CSSProperties;
}

const markerId = 'custom-connection-arrow';

const CustomConnectionLine: React.FC<CustomConnectionLineProps> = ({ fromX, fromY, toX, toY, connectionLineStyle }) => {
  const [edgePath] = getStraightPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
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
        style={connectionLineStyle}
        fill="none"
        d={edgePath}
        markerEnd={`url(#${markerId})`}
      />
    </g>
  );
};

export default CustomConnectionLine; 