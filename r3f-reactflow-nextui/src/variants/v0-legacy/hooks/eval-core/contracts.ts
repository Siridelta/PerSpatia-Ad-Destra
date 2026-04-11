import type { ExecutionResult } from '@v0/services/jsExecutor';
import type { CanvasEdgeUIData } from '@v0/types/canvas';

export interface ResolvedDepIOs {
  incomingByTarget: Record<string, string[]>;
  outgoingBySource: Record<string, string[]>;
}

export interface ResolvedDPIOs {
  incomingByTarget: Record<string, { source: string; sourceOutputName: string }>;
  outgoingBySource: Record<string, Record<string, string>>;
}

/**
 * 依赖解析器契约：
 * - 输入当前 UI 边集合；
 * - 输出 eval 需要的依赖映射结构。
 */
export interface EvalDependencyResolver {
  resolve: (edges: CanvasEdgeUIData[]) => {
    depIOs: ResolvedDepIOs;
    DPIOs: ResolvedDPIOs;
  };
}

/**
 * 执行引擎契约：
 * - 输入 code 与已解析输入值；
 * - 返回统一 ExecutionResult，便于后续替换运行时引擎。
 */
export interface EvalExecutionEngine {
  executeCode: (code: string, inputs: Record<string, any>) => Promise<ExecutionResult>;
}
