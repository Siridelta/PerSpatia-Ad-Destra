import { Node } from '../models/Node';
import { Edge } from '../models/Edge';

type EvaluationContext = {
  nodes: Node[];
  edges: Edge[];
  nodeValues: Map<string, any>;
};

export class Evaluator {
  private context: EvaluationContext;

  constructor(nodes: Node[], edges: Edge[]) {
    this.context = {
      nodes,
      edges,
      nodeValues: new Map(),
    };
  }

  evaluate(startNodeId: string): any {
    const visited = new Set<string>();
    return this.evaluateNode(startNodeId, visited);
  }

  private evaluateNode(nodeId: string, visited: Set<string>): any {
    if (visited.has(nodeId)) {
      throw new Error('Circular dependency detected');
    }

    visited.add(nodeId);
    const node = this.context.nodes.find((n) => n.id === nodeId);

    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // If we already have a cached value for this node, return it
    if (this.context.nodeValues.has(nodeId)) {
      return this.context.nodeValues.get(nodeId);
    }

    // Get input values from incoming edges
    const incomingEdges = this.context.edges.filter((e) => e.target === nodeId);
    const inputs = incomingEdges.map((edge) => {
      return this.evaluateNode(edge.source, new Set(visited));
    });

    // Evaluate the node based on its type and inputs
    let result: any;
    switch (node.type) {
      case 'number':
        result = Number(node.data.value);
        break;
      case 'string':
        result = String(node.data.value);
        break;
      case 'add':
        result = inputs.reduce((a, b) => a + b, 0);
        break;
      case 'multiply':
        result = inputs.reduce((a, b) => a * b, 1);
        break;
      default:
        result = node.data.value;
    }

    // Cache the result
    this.context.nodeValues.set(nodeId, result);
    return result;
  }

  clearCache(): void {
    this.context.nodeValues.clear();
  }
}