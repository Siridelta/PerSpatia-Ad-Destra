/*eslint no-unused-vars: "off" */

import { CanvasEdgeUIDataEntry, CanvasNodeUIDataEntry } from '@/types/canvas';
import { Viewport } from '@xyflow/react';

import canvas3node from './canvas-3node.json';
import canvasChainDoubler from './canvas-chain-doubler.json';

type DefaultCanvas = {
    nodes: CanvasNodeUIDataEntry[];
    edges: CanvasEdgeUIDataEntry[];
    viewport: Viewport;
}

// 默认画布数据需要携带视角信息，确保初始化与导入体验一致
export default canvas3node as unknown as DefaultCanvas;