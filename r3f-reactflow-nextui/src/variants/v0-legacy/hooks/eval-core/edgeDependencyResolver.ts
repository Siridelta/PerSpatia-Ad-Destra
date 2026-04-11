import { CanvasEdgeKind, type CanvasEdgeUIData } from '@v0/types/canvas';
import type { EvalDependencyResolver } from './contracts';

const buildDepIOs = (edges: CanvasEdgeUIData[]) => {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};

  edges.forEach((edge) => {
    const { source, target } = edge;
    if (!incoming[target]) incoming[target] = [];
    if (!incoming[target].includes(source)) incoming[target].push(source);

    if (!outgoing[source]) outgoing[source] = [];
    if (!outgoing[source].includes(target)) outgoing[source].push(target);
  });

  return { incomingByTarget: incoming, outgoingBySource: outgoing };
};

const buildDPIOs = (edges: CanvasEdgeUIData[]) => {
  const incoming: Record<string, { source: string; sourceOutputName: string }> = {};
  const outgoing: Record<string, Record<string, string>> = {};

  edges.forEach((edge) => {
    if (edge.type !== CanvasEdgeKind.DesmosPreviewEdge) return;
    const { source, target, data } = edge;
    const { sourceOutputName } = data;

    if (incoming[target]) {
      throw new Error('A target can only have one Desmos Preview Edge');
    }
    incoming[target] = { source, sourceOutputName };

    if (!outgoing[source]) outgoing[source] = {};
    if (outgoing[source][sourceOutputName]) {
      throw new Error('A source can only have one Desmos Preview Edge per output');
    }
    outgoing[source][sourceOutputName] = target;
  });

  return { incomingByTarget: incoming, outgoingBySource: outgoing };
};

/**
 * 默认 resolver：根据画布边关系推导依赖。
 * 后续可替换为“符号解析依赖”实现。
 */
export const edgeDependencyResolver: EvalDependencyResolver = {
  resolve: (edges) => ({
    depIOs: buildDepIOs(edges),
    DPIOs: buildDPIOs(edges),
  }),
};
