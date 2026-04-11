import { jsExecutor } from '@/services/jsExecutor';
import type { EvalExecutionEngine } from './contracts';

/**
 * 默认执行引擎：直接桥接现有 jsExecutor。
 * 后续可替换为 Observable Runtime 等引擎实现。
 */
export const jsExecutionEngine: EvalExecutionEngine = {
  executeCode: (code, inputs) => jsExecutor.executeCode(code, inputs),
};
