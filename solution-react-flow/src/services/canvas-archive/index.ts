import type { CanvasArchive, CanvasArchiveLegacy, CanvasArchiveState } from '@/types/persistence';
import { v7ToV8 } from './migrations/v7-to-v8';
import { v8ToV9 } from './migrations/v8-to-v9';
import { toV7 } from './migrations/to-v7';

export const STORAGE_KEY = 'desmos-canvas-flow-state';
export const STORAGE_VERSION = 9;

/**
 * 把当前最新状态编码为带版本信息的存档 JSON 文本。
 */
export const serializeCanvasArchive = (state: CanvasArchiveState): string => {
  const archive: CanvasArchive = {
    version: STORAGE_VERSION,
    state,
  };
  return JSON.stringify(archive);
};

/**
 * 将存档迁移到最新版本。
 */
export const migrateToLatest = (archive: CanvasArchiveLegacy): CanvasArchive => {

  if (archive.version < 7) {
    archive = toV7(archive);
  }
  if (archive.version < 8) {
    archive = v7ToV8(archive);
  }
  if (archive.version < 9) {
    archive = v8ToV9(archive);
  }
  return archive;
};

/**
 * 从 JSON 文本解析并迁移到当前最新结构。
 */
export const parseCanvasArchiveText = (text: string): CanvasArchiveState | null => {
  let archive = JSON.parse(text);
  if (!archive || !archive.version || !archive.state) {
    return null;
  }
  return migrateToLatest(archive).state;
};

