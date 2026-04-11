import type { CanvasArchiveLegacy } from '@v0/types/persistence';
import type { V10CanvasStateLike } from './v9-to-v10';

/**
 * v10 -> v11:
 * - 重命名 camera 字段：targetX/Y -> orbitCenterX/Y
 */
export const v10ToV11 = (archive: CanvasArchiveLegacy): CanvasArchiveLegacy => {
  if (archive.version >= 11) return archive;

  const state = archive.state as V10CanvasStateLike;
  if (state && state.camera) {
    const { targetX, targetY, ...rest } = state.camera;
    (state as any).camera = {
      ...rest,
      orbitCenterX: targetX ?? 0,
      orbitCenterY: targetY ?? 0,
    };
  }

  archive.version = 11;
  return archive;
};
