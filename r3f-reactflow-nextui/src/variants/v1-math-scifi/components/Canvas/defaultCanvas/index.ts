/*eslint no-unused-vars: "off" */

import type { CanvasArchiveState } from '@v1/types/persistence';
import { migrateToLatest } from '@v1/services/canvas-archive';

import canvas3node from './canvas-3node.json';
import canvasChainDoubler from './canvas-chain-doubler.json';

type DefaultCanvas = CanvasArchiveState;

/**
 * 将默认模板统一转成「最新可用 state」：
 * - 允许默认 JSON 以 archive 包（{ version, state }）存在；
 * - 在模块加载时立刻复用 migration 链升级到最新结构；
 * - 这样后续结构升级时，默认模板无需手工逐个改字段。
 */
const resolveDefaultState = (raw: unknown): DefaultCanvas => {
  const candidate = raw as { version?: number; state?: unknown };
  if (typeof candidate?.version === 'number' && candidate.state) {
    // 迁移函数内部会原地修改对象，这里深拷贝一份避免污染 import 对象。
    const clonedArchive = JSON.parse(JSON.stringify({
      version: candidate.version,
      state: candidate.state,
    }));
    return migrateToLatest(clonedArchive).state as DefaultCanvas;
  }
  // 兜底兼容：若给的是裸 state（历史模板），直接按当前 state 结构使用。
  return raw as DefaultCanvas;
};

export const defaultCanvas3Node = resolveDefaultState(canvas3node);
export const defaultCanvasChainDoubler = resolveDefaultState(canvasChainDoubler);

export default defaultCanvas3Node;