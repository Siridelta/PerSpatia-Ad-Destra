import { CanvasArchiveLegacy } from '@v0/types/persistence';
import type { Viewport } from '@xyflow/react';

export const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

/**
 * 处理 v1-v7 的历史混合结构（nodes/edges/viewport 在同层）
 * 返回仍是混合结构，供下一段迁移继续处理。
 */
export const toV7 = (archive: CanvasArchiveLegacy): CanvasArchiveLegacy => {

  // v2: 添加 viewport
  if (archive.version < 2 || !archive.state.viewport) {
    archive.state.viewport = defaultViewport;
    archive.version = 2;
  }

  // v3: label -> code
  if (archive.version < 3) {
    archive.state.nodes = archive.state.nodes.map((node: any) => ({
      ...node,
      data: {
        ...node.data,
        code: typeof node.data?.label === 'string' ? node.data.label : '',
      },
    }));
    archive.version = 3;
  }

  // v4: 添加 controlsCache
  if (archive.version < 4 || !archive.state.controlsCache) {
    archive.state.controlsCache = {};
    archive.version = 4;
  }

  // v5: 添加 desmosPreviewLinks
  if (archive.version < 5 || !archive.state.desmosPreviewLinks) {
    archive.state.desmosPreviewLinks = {};
    archive.version = 5;
  }

  // v6: controlsCache 并入节点 data
  if (archive.version < 6 && archive.state.controlsCache) {
    archive.state.nodes = archive.state.nodes.map((node: any) => {
      if (node.type === 'textNode') {
        const controls = archive.state.controlsCache?.[node.id] ?? [];
        return {
          ...node,
          data: {
              ...node.data,
              controls,
              autoResizeWidth: node.data.autoResizeWidth ?? true,
              nodeName: node.data.nodeName ?? '',
              isCollapsed: node.data.isCollapsed ?? false,
              hiddenSections: node.data.hiddenSections ?? {
                inputs: false,
                outputs: false,
                logs: false,
                errors: false,
              },
            },
          };
        }
        return node;
      }),
    archive.state.controlsCache = undefined;
    archive.version = 6;
  }

  // v7: desmosPreviewLinks -> desmosPreviewEdge
  if (archive.version < 7) {
    const legacyLinks = archive.state.desmosPreviewLinks ?? {};
    if (Array.isArray(archive.state.edges) && legacyLinks && Object.keys(legacyLinks).length > 0) {
      archive.state.edges = archive.state.edges.map((edge: any) => {
        const link = legacyLinks[edge.source];
        if (link && edge.target === link.previewNodeId) {
          return {
            ...edge,
            type: 'desmosPreviewEdge',
            data: {
              ...(edge.data ?? {}),
              sourceOutputName: link.outputName,
            },
          };
        }
        return edge;
      });
    }

    if (Array.isArray(archive.state.nodes)) {
      archive.state.nodes = archive.state.nodes.map((node: any) => {
        if (node.type === 'desmosPreviewNode') {
          const {
            desmosState: _legacyState,
            sourceNodeId: _legacySource,
            sourceOutputName: _legacyOutput,
            ...restData
          } = node.data ?? {};
          return {
            ...node,
            data: restData,
          };
        }
        return node;
      });
    }

    archive.state.desmosPreviewLinks = undefined;
    archive.version = 7;
  }

  return archive;
};

