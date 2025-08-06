import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { jsExecutor, ControlInfo } from '@/services/jsExecutor';

export interface ErrorInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface WarningInfo {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface UseNodeExecutionProps {
  id: string;
  onControlsChange: (controls: ControlInfo[]) => void;
  onOutputsChange: (outputs: Record<string, any>) => void;
  onLogsChange: (logs: string[]) => void;
  onErrorsChange: (errors: ErrorInfo[]) => void;
  onWarningsChange: (warnings: WarningInfo[]) => void;
  getConnectedNodeData: () => Record<string, any>;
}

export interface UseNodeExecutionReturn {
  // 状态
  isExecuting: boolean;
  controls: ControlInfo[];
  outputs: Record<string, any>;
  consoleLogs: string[];
  errors: ErrorInfo[];
  warnings: WarningInfo[];

  // 执行方法
  executeCode: (code: string, inputValues?: Record<string, any>) => Promise<void>;

  // 状态更新
  setControls: Dispatch<SetStateAction<ControlInfo[]>>;
  setOutputs: Dispatch<SetStateAction<Record<string, any>>>;
  setConsoleLogs: Dispatch<SetStateAction<string[]>>;
  setErrors: Dispatch<SetStateAction<ErrorInfo[]>>;
  setWarnings: Dispatch<SetStateAction<WarningInfo[]>>;
}

export const useNodeExecution = ({
  id,
  onControlsChange,
  onOutputsChange,
  onLogsChange,
  onErrorsChange,
  onWarningsChange,
  getConnectedNodeData,
}: UseNodeExecutionProps): UseNodeExecutionReturn => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [controls, setControls] = useState<ControlInfo[]>([]);
  const [outputs, setOutputs] = useState<Record<string, any>>({});
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [warnings, setWarnings] = useState<WarningInfo[]>([]);

  // 执行JS代码
  const executeCode = useCallback(async (code: string, inputValues: Record<string, any> = {}) => {
    if (!code.trim()) {
      // 清空错误状态
      if (errors.length > 0 || warnings.length > 0) {
        setErrors([]);
        setWarnings([]);
        onErrorsChange([]);
        onWarningsChange([]);
      }
      return;
    }

    // 如果正在执行，跳过新的执行请求
    if (isExecuting) {
      console.log('代码正在执行中，跳过新的执行请求');
      return;
    }

    console.log('执行JS代码:', code, '输入值:', inputValues);
    setIsExecuting(true);

    try {
      // 获取所有连接节点的输出数据
      const connectedInputValues = getConnectedNodeData();

      // 合并用户输入值和连接节点的数据
      const allInputValues = {
        ...connectedInputValues,
        ...controls.reduce((acc, control) => {
          const value = control.value ?? control.defaultValue;
          if (value !== undefined) {
            acc[control.name] = value;
          }
          return acc;
        }, {} as Record<string, any>),
        ...inputValues
      };

      console.log('所有输入值（包括连接数据）:', allInputValues);

      const result = await jsExecutor.executeCode(code, allInputValues);

      if (result.success) {
        // 更新控件信息
        setControls(result.controls);
        onControlsChange(result.controls);

        // 更新输出
        setOutputs(result.outputs);
        onOutputsChange(result.outputs);

        // 更新日志
        setConsoleLogs(result.logs);
        onLogsChange(result.logs);

        // 清空错误和警告
        setErrors([]);
        setWarnings([]);
        onErrorsChange([]);
        onWarningsChange([]);

        console.log('代码执行成功:', result);
      } else {
        console.error('代码执行失败:', result.errors);

        // 更新错误状态
        const sortedErrors = (result.errors || []).sort((a: any, b: any) => (a.line || 0) - (b.line || 0));
        setErrors(sortedErrors);
        setWarnings(result.warnings || []);
        onErrorsChange(sortedErrors);
        onWarningsChange(result.warnings || []);
      }
    } catch (error) {
      console.error('代码执行失败(internal failure):', error);
      const errorInfo = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      setErrors([errorInfo]);
      onErrorsChange([errorInfo]);
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, errors.length, warnings.length, controls, getConnectedNodeData, onControlsChange, onOutputsChange, onLogsChange, onErrorsChange, onWarningsChange]);

  return {
    isExecuting,
    controls,
    outputs,
    consoleLogs,
    errors,
    warnings,
    executeCode,
    setControls,
    setOutputs,
    setConsoleLogs,
    setErrors,
    setWarnings,
  };
}; 