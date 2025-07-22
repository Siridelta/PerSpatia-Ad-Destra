import { Node, Edge } from '@xyflow/react';

// 导出画布数据到文件
export const exportCanvasData = (nodes: Node[], edges: Edge[]) => {
  const canvasData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    nodes,
    edges,
  };

  const dataStr = JSON.stringify(canvasData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `canvas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// 导入画布数据
export const importCanvasData = (): Promise<{ nodes: Node[], edges: Edge[] }> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          
          // 验证数据格式
          if (!data.nodes || !Array.isArray(data.nodes)) {
            throw new Error('无效的节点数据格式');
          }
          if (!data.edges || !Array.isArray(data.edges)) {
            throw new Error('无效的边数据格式');
          }

          resolve({
            nodes: data.nodes,
            edges: data.edges
          });
        } catch (error) {
          reject(new Error(`解析文件失败: ${error instanceof Error ? error.message : '未知错误'}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };
      
      reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
};

// 导入指定的节点到画布（不替换整个画布）
export const importNodesToCanvas = (currentNodes: Node[], currentEdges: Edge[], newNodes: Node[], newEdges: Edge[]): { nodes: Node[], edges: Edge[] } => {
  // 为导入的节点生成新的ID，避免冲突
  const idMapping: Record<string, string> = {};
  const offsetX = 50; // 导入的节点位置偏移
  const offsetY = 50;

  // 生成新节点ID映射
  newNodes.forEach(node => {
    const newId = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    idMapping[node.id] = newId;
  });

  // 更新节点ID和位置
  const processedNodes = newNodes.map(node => ({
    ...node,
    id: idMapping[node.id],
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY
    },
    selected: false // 导入的节点不选中
  }));

  // 更新边的source和target ID
  const processedEdges = newEdges
    .filter(edge => idMapping[edge.source] && idMapping[edge.target]) // 只保留两端都存在的边
    .map(edge => ({
      ...edge,
      id: `imported-edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: idMapping[edge.source],
      target: idMapping[edge.target],
      selected: false
    }));

  return {
    nodes: [...currentNodes, ...processedNodes],
    edges: [...currentEdges, ...processedEdges]
  };
}; 